
import util from 'util'

export function logError(data) {
    console.log(util.inspect(data, { depth: null, colors: true }))
}