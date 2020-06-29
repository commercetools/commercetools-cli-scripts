const ctpUtils = require('../shared/ctp-utils')
const constant = require('./constant')
const Promise = require('bluebird')

const vatConstant = constant.vatConstant

async function getTaxCategories (ctpClient) {
    const params = {
        queryBody: `query getTaxCategories($limit: Int) {
                        taxCategories (limit: $limit) {
                            results {
                                name,
                                id,
                                key,
                                description, 
                                rates {
                                    name, 
                                    amount, 
                                    country, 
                                    includedInPrice,
                                    id
                                },
                                version
                            }
                        }
                    }`,
        endpoint: 'taxCategories',
        variables: {
            limit: 500
        }
    }

    try {
        let taxCategories = []
        for await (const batch of ctpClient.fetchGraphQlBatches(params)) {
            await Promise.map(batch, async (taxCategory) => {
                taxCategories.push(taxCategory)
            }, { concurrency: 4 })
        }
        return taxCategories
    } catch (e) {
        console.log(e)
    }
}

async function replaceTaxRate(ctpClient, taxCategoryId, updateJsonObj) {
    try {

        await ctpClient.update(ctpClient.builder.taxCategories, taxCategoryId,
            updateJsonObj.version, updateJsonObj.actions)
    } catch (e) {
        console.log(e)
    }
}

// Filter the tax category list to obtain a list of tax rates which has following criteria :
// 1. country code = 'DE'
// 2. tax rate = 19% or 7%
async function getGermanValidTaxRateList(taxCategories, taxRateIdToTaxCategoryMap) {
    let germanTaxRateList = taxCategories
        .flatMap(item => item.rates)
        .filter(rate => rate.country ==='DE')
    let validGermanTaxRateList = []
    if (germanTaxRateList.length === 0) {
        let errMsg  =   'No valid tax rate from Germany. There is nothing to be done in your project in ' +
                        'respect to VAT.' + '\n'
        console.error(errMsg)
        return validGermanTaxRateList
    }
    let invalidGermanTaxRateList = germanTaxRateList.filter(rate =>
        rate.amount !== vatConstant.TAX_RATE_STANDARD_OLD &&
        rate.amount !== vatConstant.TAX_RATE_REDUCED_OLD)
    validGermanTaxRateList = germanTaxRateList
        .filter(rate => rate.amount===vatConstant.TAX_RATE_STANDARD_OLD ||
            rate.amount === vatConstant.TAX_RATE_REDUCED_OLD)

    const standardVATs = validGermanTaxRateList.filter(rate => rate.amount === vatConstant.TAX_RATE_STANDARD_OLD)
    const reducedVATs = validGermanTaxRateList.filter(rate => rate.amount === vatConstant.TAX_RATE_REDUCED_OLD)
    let errMsg  = null
    if (invalidGermanTaxRateList.length>0) {
        errMsg  = 'We are sorry, we would have to ask you to change the vat manually if applicable. ' +
            'There seems to be a special case.' + '\n'
        errMsg += await buildTaxRateDraftJson(invalidGermanTaxRateList, taxRateIdToTaxCategoryMap)
        console.error(errMsg)
    }
    if (standardVATs.length > 1) {
        errMsg  = 'We are sorry but there are several tax rates for "DE" with a percentage ' +
            'of ' + vatConstant.TAX_RATE_STANDARD_OLD*100 + ' percent. Please update the tax rate manually. ' + '\n'
        errMsg += await buildTaxRateDraftJson(standardVATs, taxRateIdToTaxCategoryMap)
        console.error(errMsg)
    }
    if (reducedVATs.length > 1) {
        errMsg  = 'We are sorry but there are several tax rates for "DE" with a percentage ' +
            'of ' + vatConstant.TAX_RATE_REDUCED_OLD*100 + ' percent. Please update the tax rate manually. ' + '\n'
        errMsg += await buildTaxRateDraftJson(reducedVATs, taxRateIdToTaxCategoryMap)
        console.error(errMsg)
    }

    return validGermanTaxRateList
}

async function buildTaxRateDraftJson(taxRateList, taxRateIdToTaxCategoryMap) {
    let msg = ''
    taxRateList.forEach(item => {
        msg += 'Tax Category Name : '+taxRateIdToTaxCategoryMap.get(item.id).name + '\n'
        msg += JSON.stringify(item) + '\n'
    })
    return msg
}

async function buildTaxRateIdToTaxCategoryMap(items) {
    const map = new Map()
    for (const item of items) {
        let taxCategoryItem = {
            id : item.id,
            version : item.version,
            name : item.name,
            key : item.key
        }
        item.rates.forEach( rate => map.set(rate.id,  taxCategoryItem))
    }
    return map
}

async function getUpdateJsonObj(taxRateDraft, taxRateIdToTaxCategoryMap ) {
    const taxCategoryItem = taxRateIdToTaxCategoryMap.get(taxRateDraft.id)

    const updateJsonObj = {
        version : taxCategoryItem.version,
        actions : [
            {
                action: "replaceTaxRate",
                taxRateId: taxRateDraft.id,
                taxRate: {
                    name: taxRateDraft.name,
                    amount: taxRateDraft.amount,
                    includedInPrice : taxRateDraft.includedInPrice,
                    country: taxRateDraft.country
                }
            }
        ]
    }
    return updateJsonObj

}

async function processTaxRate({ctpClient, taxRateDraftList, taxRateIdToTaxCategoryMap, oldTaxRate, newTaxRate,
                                  isDryRun}) {
    let clonedTaxRateDraftList = JSON.parse(JSON.stringify(taxRateDraftList))
    for (const taxRateDraft of clonedTaxRateDraftList) {
        taxRateDraft.amount  = newTaxRate
        const updateJsonObj = await getUpdateJsonObj(taxRateDraft, taxRateIdToTaxCategoryMap)
        if (!isDryRun) {
            console.log('Start to replace tax rate ... ')
            await replaceTaxRate(ctpClient, taxRateIdToTaxCategoryMap.get(taxRateDraft.id).id, updateJsonObj)
            console.log('Update finished')
        } else {
            console.log('Current tax rate would be replaced as below : ')
            console.log(JSON.stringify(updateJsonObj))
        }
    }
}

async function printPreviewModeWarning() {
    console.log('********************************************************************')
    console.log('The script has been run in preview mode. To update the tax rates, ' + '\n' +
        'you can input argument "-update" in CLI to run this script.')
    console.log('Please make sure to resolve all tax categories and rates warnings ' + '\n' +
        'before running the script in update mode.')
    console.log('********************************************************************')
}

async function initConfigOptions() {
    const args = process.argv.slice(2);
    const configOptions = {
        ctp : {
            projectKey : process.env.PROJECT_KEY,
            clientId : process.env.CLIENT_ID,
            clientSecret : process.env.CLIENT_SECRET
        },
        dryRun: true
    }

    // Check environment variables
    if (!configOptions.ctp.projectKey || !configOptions.ctp.clientId || !configOptions.ctp.clientSecret) {
        console.error('Please set project key, client ID and client secret in environment variables')
        return
    }

    // Check update mode / preview mode
    if (args.length>0 && args[0] === '-update') {
        configOptions.dryRun = false
    }
    return configOptions
}

(async function main() {
    const configOptions = await initConfigOptions()
    const ctpClient = ctpUtils.setUpClient(configOptions)

    let taxCategories = await getTaxCategories(ctpClient)

    const taxRateIdToTaxCategoryMap = await buildTaxRateIdToTaxCategoryMap(taxCategories)

    const validGermanTaxRateList = await getGermanValidTaxRateList(taxCategories,
        taxRateIdToTaxCategoryMap)

    let taxRateDraftList =  validGermanTaxRateList.filter(rate => rate.amount === vatConstant.TAX_RATE_STANDARD_OLD)
    if (taxRateDraftList.length>=1) {
        // Printout Json format TaxRateDraft and update it if it is not dry run.
        await processTaxRate({
            ctpClient: ctpClient,
            taxRateDraftList: taxRateDraftList,
            taxRateIdToTaxCategoryMap: taxRateIdToTaxCategoryMap,
            oldTaxRate : vatConstant.TAX_RATE_STANDARD_OLD,
            newTaxRate : vatConstant.TAX_RATE_STANDARD_NEW,
            isDryRun: configOptions.dryRun
        })
    }

    taxRateDraftList =  validGermanTaxRateList.filter(rate => rate.amount === vatConstant.TAX_RATE_REDUCED_OLD)
    if (taxRateDraftList.length>=1) {
        await processTaxRate({
            ctpClient: ctpClient,
            taxRateDraftList: taxRateDraftList,
            taxRateIdToTaxCategoryMap: taxRateIdToTaxCategoryMap,
            oldTaxRate: vatConstant.TAX_RATE_REDUCED_OLD,
            newTaxRate: vatConstant.TAX_RATE_REDUCED_NEW,
            isDryRun: configOptions.dryRun
        })
    }

    if (configOptions.dryRun) {
        await printPreviewModeWarning()
    }
})()