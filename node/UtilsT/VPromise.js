// @ts-check

/**
 * @callback VPromise
 * @param {() => void} resolve
 * @param {(reason?: any) => void} reject
 * @returns {void}
 */

/**
 * @param {VPromise} f
 * @returns {Promise<void>}
 */
function vpromise(f) {
    return new Promise(f);
}

module.exports = { vpromise };
