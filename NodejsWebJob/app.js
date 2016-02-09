var uuid = require('uuid');

console.log('Hello world');
console.log('Mor was here');

setTimeout(function () {
    console.info('two seconds have passed...');
    console.info(uuid.v4());
}, 2000);