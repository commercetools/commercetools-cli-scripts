export function initConfigOptions() {
    const configOptions = {
        ctp : {
            projectKey: process.env.CTP_PROJECT_KEY,
            clientId: process.env.CTP_CLIENT_ID,
            clientSecret: process.env.CTP_CLIENT_SECRET,
            apiUrl: process.env.CTP_API_URL,
            authUrl: process.env.CTP_AUTH_URL
        }
    }

    if (!configOptions.ctp.projectKey || !configOptions.ctp.clientId || !configOptions.ctp.clientSecret
        || !configOptions.ctp.apiUrl || !configOptions.ctp.authUrl)
        throw new Error('Required environment variables missing: CTP_PROJECT_KEY, CTP_CLIENT_ID, CTP_CLIENT_SECRET, CTP_API_URL, CTP_AUTH_URL')

    return configOptions
}