var uuid = require('uuid');

console.log('Hello world');
console.log('Mor was here');

setInterval(function () {
    console.info('two seconds have passed... WOW!!!!!!!!!!');
    console.info(uuid.v4());
}, 2000);