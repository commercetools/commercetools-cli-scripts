import fetch from 'node-fetch'
import {createClient} from '@commercetools/sdk-client'
import {createRequestBuilder} from '@commercetools/api-request-builder'
import {createHttpMiddleware} from '@commercetools/sdk-middleware-http'
import {createQueueMiddleware} from '@commercetools/sdk-middleware-queue'
import {createAuthMiddlewareForClientCredentialsFlow} from '@commercetools/sdk-middleware-auth'
import _ from 'lodash'
import util from 'util'

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

export function setUpClient(config) {
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

        async * fetchPages ({ variables, endpoint }) {
            const originalWhere = variables.where
            // ensure limit is always set since it helps to avoid last/obsolete request
            if (!variables.limit)
              variables.limit = 20

            let lastId = null

            // to ensure we do not fetch duplicate results we have to sort by id only
            variables.sort = ['id']

            while (true) {
              const where = [(lastId ? `id > "${lastId}"` : null), originalWhere].filter(Boolean).join(' AND ')

              if (where)
                variables.where = where

              const data = await this.fetch(this.buildUri(variables, endpoint))
              const results = data.body.results

              yield results

              // Due to performance best practce we do not rely on total count. 
              // As a consequence, in case last page results length is the same as 
              // the limit we will do 1 obsolete request with 0 results.
              if (!results.length || results.length < variables.limit) {
                break
              }

              lastId = _.last(results).id
            }
        },

        async * fetchPagesGraphQl ({ queryBody, variables, endpoint }) {
            const originalWhere = variables.where
            // ensure limit is always set since it helps to avoid last/obsolete request
            if (!variables.limit)
              variables.limit = 20

            let lastId = null

            // to ensure we do not fetch duplicate results we have to sort by id only
            variables.sort = ['id asc']

            while (true) {
              const where = [(lastId ? `id > "${lastId}"` : null), originalWhere].filter(Boolean).join(' AND ')

              if (where)
                variables.where = where

              const data = await this.queryGraphQl(queryBody, variables)

              if (_.get(data, 'body.errors.length')) {
                const e = { queryBody: queryBody, variables: variables, errors: data }
                throw new Error(util.inspect(e, { showHidden: true, depth: null, colors: true }))
              }
              const { results } = data.body.data[endpoint]

              yield results

              // Due to performance best practce we do not rely on total count. 
              // As a consequence, in case last page results length is the same as 
              // the limit we will do 1 obsolete request with 0 results.
              if (!results.length || results.length < variables.limit) {
                break
              }

              lastId = _.last(results).id
            }
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
                uri.where(variables.where)
            uri.perPage(variables.limit)
            if (variables.sort)
                uri.sort(variables.sort, true)
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
    return _.merge(customMethods, ctpClient)
}

export function initConfigOptions() {
    const configOptions = {
        ctp : {
            projectKey : process.env.PROJECT_KEY,
            clientId : process.env.CLIENT_ID,
            clientSecret : process.env.CLIENT_SECRET
        }
    }

    if (!configOptions.ctp.projectKey || !configOptions.ctp.clientId || !configOptions.ctp.clientSecret) {
        console.error('Please set project key, client ID and client secret in environment variables')
        return
    }

    return configOptions
}

function getRequestBuilder(projectKey) {
    return createRequestBuilder({projectKey})
}

export function logError(data) {
    console.log(util.inspect(data, { depth: null, colors: true }))
}