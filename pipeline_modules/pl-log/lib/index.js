
var logging = require('azure-logging');

function init(options, cb) {
    logging.writer(options, function (err, logwriter) {
        if (err) return cb(err);

        // replace console.xxx with logwriter.xxx
        logging.interceptor.replace(console, logwriter);

        return cb();
    });
};

function getInstanceId() {
    var instanceId = process.env.RoleInstanceID;
    if (!instanceId) return 'local';
    return instanceId.split('.').pop();
}

module.exports = {
    init: init,
    getInstanceId: getInstanceId
};
