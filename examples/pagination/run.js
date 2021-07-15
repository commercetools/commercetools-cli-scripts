import { initConfigOptions } from '../../utils/config.js'
import { setUpClient } from '../../utils/client.js'
import { logError } from '../../utils/logger.js'


function getQueryData() {
    return {
        queryBody: `query getOrders($limit: Int, $sort: [String!], $where: String) {
                        orders (limit: $limit, sort: $sort, where: $where) {
                            results {
                                id
                            }
                        }
                    }`,
        endpoint: 'orders',
        variables: {
            limit: 50
        }
    }
}

async function paginateOrders (ctpClient) {
    await paginateWithGraphQl(ctpClient, getQueryData())
    await paginateWithRest(ctpClient, getQueryData())
    await paginateWithSdk(ctpClient, getQueryData())
}

// paginate with graphQL and generator approach
async function paginateWithGraphQl(ctpClient, params) {
    try {
        let totalItems = 0
        let pageCount = 0
        for await (const page of ctpClient.fetchPagesGraphQl(params)) {
            totalItems += page.length
            pageCount++
            console.log(`Page ${pageCount}: ${page.length} items.`)
        }
        console.log('Total orders with GraphQL: ' + totalItems)
    } catch (e) {
        logError(e)
    }
}

// paginate with REST and generator approach
async function paginateWithRest(ctpClient, params) {
    try {
        let totalItems = 0
        let pageCount = 0
        for await (const page of ctpClient.fetchPages(params)) {
            totalItems += page.length
            pageCount++
            console.log(`Page ${pageCount}: ${page.length} items.`)
        }
        console.log('Total orders with REST: ' + totalItems)
    } catch (e) {
        logError(e)
    }
}

// paginate with REST (part of nodejs SDK)
async function paginateWithSdk(ctpClient, { variables, endpoint }) {
    const uri = ctpClient.buildUri(variables, endpoint)
    const request = ctpClient.buildRequestOptions(uri.build())
    try {
        let totalItems = 0
        let pageCount = 0
        await ctpClient.process(request, async (response) => {
            let page = response.body.results
            totalItems += page.length
            pageCount++
            console.log(`Page ${pageCount}: ${page.length} items.`)
        }, 
        { accumulate: false })

        console.log('Total orders with SDK (REST): ' + totalItems)
    } catch (e) {
        logError(e)
    }
}

(function main() {
    const configOptions = initConfigOptions()
    if (!configOptions) {
        return
    }
    const ctpClient = setUpClient(configOptions)
    paginateOrders(ctpClient)
})()