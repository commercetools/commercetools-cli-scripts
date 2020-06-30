const fetch = require('node-fetch')
const {merge, last, get} = require('lodash')
const {createClient} = require('@commercetools/sdk-client')
const {createAuthMiddlewareForClientCredentialsFlow} = require('@commercetools/sdk-middleware-auth')
const {createHttpMiddleware} = require('@commercetools/sdk-middleware-http')
const {createQueueMiddleware} = require('@commercetools/sdk-middleware-queue')
const {createRequestBuilder} = require('@commercetools/api-request-builder')
const _ = require('lodash')

function createCtpClient({clientId, clientSecret, projectKey, concurrency = 4}) {
    const AUTH_HOST = process.env.AUTH_HOST || 'https://auth.europe-west1.gcp.commercetools.com'
    const API_HOST = process.env.API_HOST || 'https://api.europe-west1.gcp.commercetools.com'
    const authMiddleware = createAuthMiddlewareForClientCredentialsFlow({
        host: AUTH_HOST,
        projectKey,
        credentials: {
            clientId,
            clientSecret
        },
        fetch
    })

    const httpMiddleware = createHttpMiddleware({
        maskSensitiveHeaderData: true,
        host: API_HOST,
        enableRetry: true,
        fetch
    })

    const queueMiddleware = createQueueMiddleware({
        concurrency
    })

    return createClient({
        middlewares: [
            authMiddleware,
            httpMiddleware,
            queueMiddleware
        ]
    })
}

function setUpClient(config) {
    const ctpClient = createCtpClient(config.ctp)
    const customMethods = {
        get builder() {
            return getRequestBuilder(config.ctp.projectKey)
        },

        buildRequestOptions(uri, method = 'GET', body = undefined) {
            return {
                uri,
                method,
                body,
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json'
                }
            }
        },

        async * fetchAsBatches({variables, endpoint}) {
            let lastId = null
            if (Array.isArray(variables.sort) && variables.sort.length)
                variables.sort.unshift('id')
            else
                variables.sort = ['id']
            do {
                variables.where = [
                    (lastId ? `id > "${lastId}"` : null),
                    variables.where
                ].filter((e) => !_.isEmpty(e))
                const data = await this.fetch(this.buildUri(variables, endpoint))
                if (get(data, 'body.errors.length'))
                    throw new Error(`Failed to fetch orders. Error:${JSON.stringify(data.body.errors)}`)
                const results = data.body.results
                if (!results.length)
                    break

                lastId = last(results).id
                variables.where = variables.where.filter((e) => !e.includes('id > '))
                yield results
            } while (true)
        },

        async * fetchGraphQlBatches({queryBody, variables, endpoint}) {
            const originalWhereQuery = variables.where
            let lastId = null
            let isEndOfResults = false
            do {
                variables.where = originalWhereQuery
                const data = await this.queryGraphQl(queryBody, variables)
                if (get(data, 'body.errors.length')) {
                    throw new Error(JSON.stringify(data.body.errors))
                }
                const {results} = data.body.data[endpoint]

                if (results.length < variables.limit) {
                    isEndOfResults = true
                }

                if (!results.length)
                    break

                lastId = last(results).id
                yield results
            } while (true && !isEndOfResults)
        },

        async queryGraphQl(query, variables) {
            const reqOptions = this.buildRequestOptions(
                `/${config.ctp.projectKey}/graphql`,
                'POST',
                {query, variables}
            )
            return ctpClient.execute(reqOptions)
        },

        buildUri(variables, endpoint) {
            const uri = this.builder[endpoint]
            if (variables.where && variables.where.length > 0)
                uri.where(variables.where.join(' AND '))
            if (variables.limit)
                uri.perPage(variables.limit)
            if (variables.sort)
                uri.sort(variables.sort.join(','))
            if (variables.expand)
                uri.expand(variables.expand)
            uri.withTotal(false)
            return uri
        },

        fetch(uri) {
            return ctpClient.execute(this.buildRequestOptions(uri.build()))
        },

        update(uri, id, version, actions) {
            const body = {
                version,
                actions
            }
            return ctpClient.execute(
                this.buildRequestOptions(uri.byId(id).build(), 'POST', body)
            )
        },

        delete(uri, id, version) {
            return ctpClient.execute(this.buildRequestOptions(
                uri.byId(id).withVersion(version).build(),
                'DELETE'
            ))
        }
    }
    return merge(customMethods, ctpClient)
}

function getRequestBuilder(projectKey) {
    return createRequestBuilder({projectKey})
}

module.exports = {
    setUpClient: (config) => setUpClient(config)
}
