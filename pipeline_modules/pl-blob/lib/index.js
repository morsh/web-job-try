var azure = require("azure-storage");
var log = require("pl-log");

module.exports = function (config) {
    
    var blobSvc;
    
    function init(cb) {
        var cb = cb || Function;
        
        blobSvc = azure.createBlobService(config.storageName, config.storageKey)
      .withFilter(new azure.ExponentialRetryPolicyFilter());
        
        return blobSvc.createContainerIfNotExists(config.blobName, function (err) {
            
            if (err) return cb(err);
            
            console.info('Opened connection on blob %s', config.blobName);
            
            return cb();
        });
    }
    
    function getFile(fileName, cb) {
        var cb = cb || Function;
        
        // Todo: in case the file is too big, use a stream or query by paging    
        blobSvc.getBlobToText(config.blobName, fileName, function (err, blobContent, blob) {
            if (err) return cb(err);
            
            console.info('Retrieved the content of %s from blob storage %s', fileName, config.blobName);
            return cb(null, blobContent, blob);
        });
    }
    
    function deleteFile(fileName, cb) {
        var cb = cb || Function;
        
        blobSvc.deleteBlob(config.blobName, fileName, function (error) {
            if (err) return cb(err);
            
            console.info('Deleted %s from blob storage %s', fileName, config.blobName);
            return cb();
        });
    }
    
    return {
        init: init,
        getFile: getFile,
        deleteFile: deleteFile
    };
};