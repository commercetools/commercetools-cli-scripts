const ctpUtils = require('../shared/ctp-utils')
const constant = require('./constant')
const Promise = require('bluebird')

const taxRate = constant.taxRate

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
                                    state, 
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

async function replaceTaxRate(ctpClient, taxRateDraft, taxCategoryItem) {
    try {
        const actions = [{
            action : 'replaceTaxRate',
            taxRateId : taxRateDraft.id,
            taxRate : taxRateDraft
        }]
        await ctpClient.update(ctpClient.builder.taxCategories, taxCategoryItem.id, taxCategoryItem.version, actions)
    } catch (e) {
        console.log(e)
    }
}

async function getGermanValidTaxRateList(taxCategories, rateIdToCategoryMap, isDryRun) {
    let germanTaxRateList = taxCategories
        .flatMap(item => item.rates)
        .filter(rate => rate.country=='DE')
    let validGermanTaxRateList = []
    if (germanTaxRateList.length==0) {
        let errMsg  =   'No valid tax rate from Germany. There is nothing to be done in your project in ' +
                        'respect to VAT.' + '\n'
        console.error(errMsg)
        return validGermanTaxRateList
    }
    let invalidGermanTaxRateList = germanTaxRateList.filter(rate =>
        rate.amount != taxRate.STANDARD.OLD &&
        rate.amount != taxRate.REDUCED.OLD)
    validGermanTaxRateList = germanTaxRateList
        .filter(rate => rate.amount==taxRate.STANDARD.OLD || rate.amount==taxRate.REDUCED.OLD)

    const standardVATs = validGermanTaxRateList.filter(rate => rate.amount == taxRate.STANDARD.OLD)
    const reducedVATs = validGermanTaxRateList.filter(rate => rate.amount == taxRate.REDUCED.OLD)
    let errMsg  = null
    if (invalidGermanTaxRateList.length>0) {
        errMsg  = 'We are sorry, we would have to ask you to change the vat manually if applicable. ' +
            'There seems to be a special case.' + '\n'
        errMsg += await buildTaxRateDraftJson(invalidGermanTaxRateList, rateIdToCategoryMap)
        console.error(errMsg)
    } else if (standardVATs.length > 1) {
        errMsg  = 'We are sorry but there are several tax rates for "DE" with a percentage ' +
            'of ' + taxRate.STANDARD.OLD*100 + ' percent. Please update the tax rate manually. ' + '\n'
        errMsg += await buildTaxRateDraftJson(standardVATs, rateIdToCategoryMap)
        console.error(errMsg)
    } else if (reducedVATs.length > 1) {
        errMsg  = 'We are sorry but there are several tax rates for "DE" with a percentage ' +
            'of ' + taxRate.REDUCED.OLD*100 + ' percent. Please update the tax rate manually. ' + '\n'
        errMsg += await buildTaxRateDraftJson(reducedVATs, rateIdToCategoryMap)
        console.error(errMsg)
    }

    return validGermanTaxRateList
}

async function buildTaxRateDraftJson(taxRateList, rateIdToCategoryMap) {
    let msg = ''
    taxRateList.forEach(item => {
        msg += 'Tax Category Name : '+rateIdToCategoryMap.get(item.id).name + '\n'
        msg += JSON.stringify(item) + '\n'
    })
    return msg
}

async function buildRateIdToCategoryMap(items) {
    const map = new Map()
    for (const item of items) {
        let categoryItem = {
            id : item.id,
            version : item.version,
            name : item.name,
            key : item.key
        }
        item.rates.forEach( rate => map.set(rate.id,  categoryItem))
    }
    return map
}

async function printUpdateJson(taxRateDraft, rateIdToCategoryMap ) {
    const taxCategoryItem = rateIdToCategoryMap.get(taxRateDraft.id)

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
    console.log(JSON.stringify(updateJsonObj))

}

async function processTaxRate(ctpClient, validGermanTaxRateList, rateIdToCategoryMap, taxRateType, isDryRun) {

    let taxRateDraftList =  validGermanTaxRateList.filter(rate => rate.amount == taxRateType.OLD)
    if (taxRateDraftList.length>=1) {
        console.log('Current tax rate would be replaced as below : ')
        for (const taxRateDraft of taxRateDraftList) {
            taxRateDraft.amount  = taxRateType.NEW
            await printUpdateJson(taxRateDraft, rateIdToCategoryMap)
            if (!isDryRun) {
                console.log('Start to replace tax rate ... ')
                await replaceTaxRate(ctpClient, taxRateDraft, rateIdToCategoryMap.get(taxRateDraft.id))
                console.log('Update finished')
            }
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
(async function main() {
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
    if (args.length>0 && args[0]=='-update') {
        configOptions.dryRun = false
    }

    const ctpClient = ctpUtils.setUpClient(configOptions)

    // Retrieve tax category list in current project
    let taxCategories = await getTaxCategories(ctpClient)

    // Initialize tax rate id <-> tax category mapping
    const rateIdToCategoryMap = await buildRateIdToCategoryMap(taxCategories)
    let validGermanTaxRateList = [];

    // Validate the existing tax categories and returned valid german tax rates in project settings
    validGermanTaxRateList = await getGermanValidTaxRateList(taxCategories, rateIdToCategoryMap, configOptions.dryRun)

    // Printout Json format TaxRateDraft and update it if it is not dry run.
    await processTaxRate(ctpClient, validGermanTaxRateList, rateIdToCategoryMap, taxRate.STANDARD, configOptions.dryRun)
    await processTaxRate(ctpClient, validGermanTaxRateList, rateIdToCategoryMap, taxRate.REDUCED, configOptions.dryRun)


    if (configOptions.dryRun) {
        await printPreviewModeWarning()
    }
})()