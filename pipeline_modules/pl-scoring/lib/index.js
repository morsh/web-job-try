
var async = require('async');
var request = require('request')
var config = require('pl-config');
var db = require('pl-db');
var constants = require('pl-constants');
var Worker = require('pl-worker').Worker;

function run(cb) {
  
  var worker = new Worker({
    processMessage: processMessage,
    queueInName: config.queues.scoring
  });
  
  return worker.run(cb);
  
  function processMessage(message, cb) {

    var data = message && message.data;
    if (!data) {
      console.error('message does not contain data field, deleting...', message);
      return cb();
    }
    
    console.log('requestType', message.requestType);
    switch(message.requestType) {
      case (constants.queues.action.LAST_ITEM_TO_SCORE) :
        return markLastItem();
      case (constants.queues.action.RESCORE) :
        return rescore();
      case (constants.queues.action.SCORE) :
        return score();
      default:
        console.error('message should not appear in this queue, deleting...', message);
        return cb();
    }
    
    // markLastItem handler
    function markLastItem() {
      // update document status to Processed
      return db.updateDocumentStatus({
          sourceId: data.sourceId,
          docId: data.docId,
          statusId: constants.documentStatus.PROCESSED
        },
        function (err) { 
          if (err) return cb(err);
          return cb();
      });
    }
    
    // rescoring handler
    function rescore() {
      console.info('starting rescoring request');
      
      // rescore all sentences
      var rowCount = 0;
      return db.getSentences({
          batchSize: config.sql.batchSize,
          rowHandler: rowHandler
        },
        function (err) { 
          if (err) return cb(err);
          console.info('rescoring request deleted from queue, %s sentences sent for rescoring', rowCount);
          return cb();
      });
      
      function rowHandler(row) {
        rowCount++;
        var scoringMessage = {
            requestType: constants.queues.action.SCORE,
            data: {
              sourceId: row.SourceId,
              docId: row.DocId,
              sentenceIndex: row.SentenceIndex,
              sentence: row.Sentence,
              mentions: JSON.parse(row.MentionsJson)
          }
        };
        var queueIn = worker.queues[constants.queues.types.IN];
        return queueIn.sendMessage(scoringMessage, function (err) {
          if (err) {
            console.error('failed to queue rescoring item', scoringMessage);
            return cb(err);
          }
        });
      }
    }

    // scoring handler
    function score() {
      return getScoring(data, function (err, result) {
        // if we had an error getting the scoring for the message,
        // we'll return and hopefully the message will be scored the next
        // time we try...
        if (err) {
          console.error('error getting scoring for message', err);
          return cb(err);
        }

        console.log('got scoring relations', JSON.stringify(result));

        if (!result.relations || !result.relations.length) {
          console.error('scorer didn\'t return relations for sentence', data, result);

          // should we delete the message from the queue? 
          // should we leave it there for reprocessing?
          return cb(); // currently will be deleted
        }

        data.entities = result.entities;
        data.relations = result.relations;
        
        // insert relations into db
        return db.upsertRelations(data, function (err) {
          
          // if we had an error inserting into db, we don't want to delete from the queue,
          // just return and hopefully the next iteration will work.
          // the item will stay in the queue until it will be processed.
          if (err) {
            console.error('error updating relation in db', err)
            return cb(err);
          }
          
          // item was processed and saved in db successfully- delete from queue
          return cb();
        });
      });
      
      function getScoring(data, cb) {
    
        var finalEntities = [];
        var finalRelations = [];
        
        var entitiesHash = {};
        var relationsHash = {};
        
        async.each(config.services.scoring,
          function (scoringService, cb) {

            var opts = {
              url: scoringService.url,
              method: 'post',
              json: {
                text: data.sentence,
                entities: data.mentions
              }
            };
            
            console.log('requesting scoring', JSON.stringify(opts));
            
            return request(opts, function (err, resp, body) {
              console.log('body', JSON.stringify(body));
              
              if (err) return cb(err);
              if (resp.statusCode !== 200) return cb(new Error('error: statusCode=' + resp.statusCode));
              
              var relations = body && body.relations || [];
              relations.forEach(function (relation) {
                
                var entities = relation.entities || []; 
                entities = entities.map(function (entity) {
                  return {
                    typeId: constants.conceptTypes[entity.type.toUpperCase()],
                    id: entity.id || entity.value,
                    name: entity.value
                  }
                });
                
                entities.forEach(function (entity) {
                  var key = entity.type + '~' + entity.id;
                  if (!entitiesHash[key]) {
                    entitiesHash[key] = 1;
                    finalEntities.push(entity);
                  }
                });
                
                // check that we have at least one mirna and one gene
                var genes = entities.filter(function (entity) {
                  return entity.typeId === constants.conceptTypes.GENE ? entity : null;
                });

                var mirnas = entities.filter(function (entity) {
                  return entity.typeId === constants.conceptTypes.MIRNA ? entity : null;
                });
                
                mirnas.forEach(function (mirna) {
                  genes.forEach(function (gene) {
                    var key = scoringService.id + '~' + mirna.id + '~' + gene.id;
                    if (relationsHash[key]) return;
                    relationsHash[key] = 1;
                    finalRelations.push({
                      scoringServiceId: scoringService.id,
                      modelVersion: body.modelVersion,
                      entity1: mirna,
                      entity2: gene,
                      relation: relation.class || relation.classification,
                      score: relation.score
                    });
                  })
                });
              });
              return cb();
            });
          },
          function (err) {
            if (err) return cb(err);

            var result = { entities: finalEntities, relations: finalRelations };
            console.log('finished processing scoring for sentence: %j', result);
            return cb(null, result);
          }
        );
      }
    }
  };
}

module.exports = {
    run: run
}