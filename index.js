// env
if (!process.env.S3_BUCKET) {
  console.log("S3_BUCKET environment variable required.");
  process.exit(1);
}
var bucket = process.env.S3_BUCKET;

var debug = require('debug')('clickberry:video-segments:worker');
var Bus = require('./lib/bus');
var bus = new Bus();
var Segmenter = require('./lib/segmenter');

function handleError(err) {
  console.error(err);
}

function publishSegmentEvent(video_id, segment_idx, segment_uri, fps, fn) {
  var segment = {
    uri: segment_uri,
    video_id: video_id,
    segment_idx: segment_idx,
    fps: fps
  };

  bus.publishVideoSegmentCreated(segment, fn);
}

bus.on('video', function (msg) {
  var video = JSON.parse(msg.body);
  debug('New video: ' + JSON.stringify(video));

  // extracting and uploading frames
  var segmenter = new Segmenter()
    .on('segment', function (segment) {
      // generate frame event
      publishSegmentEvent(video.id, segment.idx, segment.uri, segment.fps, function (err) {
        if (err) handleError(err);
      });
    })
    .on('error', function(err) {
      handleError(err);
    });

  segmenter.downloadAndExtractToS3(video.uri, bucket, function (err) {
    if (err && !err.fatal) {
      // re-queue the message again if not fatal
      debug('Video processing failed (' + video.uri +  '), skipping the file: ' + err);
      return;
    }

    debug('Video processing completed successfully: ' + video.uri);
    msg.finish();
  });
});

debug('Listening for messages...');