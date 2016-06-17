var log = require('oae-logger').logger('oae-jitsi-init');

module.exports = function (config, callback) {

    log().info('Initializing the oae-jitsi module');
    return callback();

};