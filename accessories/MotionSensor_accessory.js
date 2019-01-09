var Accessory = require('../').Accessory;
var Service = require('../').Service;
var Characteristic = require('../').Characteristic;
var uuid = require('../').uuid
const shortid = require('shortid')

const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')
const adapter = new FileSync('db.json')
const db = low(adapter)

const express = require('express')
var bodyParser = require("body-parser")
const app = express()
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json());

const port = 3000
// var alarms = []

db.defaults({ alarms: []})
  .write()

// here's a fake hardware device that we'll expose to HomeKit
var MOTION_SENSOR = {
  motionDetected: false,

  getStatus: function() {
    MOTION_SENSOR.motionDetected = false;
  },
  identify: function() {
    console.log("Identify the motion sensor!");
  }
}

// Generate a consistent UUID for our Motion Sensor Accessory that will remain the same even when
// restarting our server. We use the `uuid.generate` helper function to create a deterministic
// UUID based on an arbitrary "namespace" and the word "motionsensor".
var motionSensorUUID = uuid.generate('hap-nodejs:accessories:motionsensor');

// This is the Accessory that we'll return to HAP-NodeJS that represents our fake motionSensor.
var motionSensor = exports.accessory = new Accessory('Motion Sensor', motionSensorUUID);

// Add properties for publishing (in case we're using Core.js and not BridgedCore.js)
motionSensor.username = "1A:2B:3D:4D:2E:AF";
motionSensor.pincode = "031-45-154";

// set some basic properties (these values are arbitrary and setting them is optional)
motionSensor
  .getService(Service.AccessoryInformation)
  .setCharacteristic(Characteristic.Manufacturer, "Oltica")
  .setCharacteristic(Characteristic.Model, "Rev-1")
  .setCharacteristic(Characteristic.SerialNumber, "A1S2NASF88EW");

// listen for the "identify" event for this Accessory
motionSensor.on('identify', function(paired, callback) {
  MOTION_SENSOR.identify();
  callback(); // success
});

motionSensor
  .addService(Service.MotionSensor, "Fake Motion Sensor") // services exposed to the user should have "names" like "Fake Motion Sensor" for us
  .getCharacteristic(Characteristic.MotionDetected)
  .on('get', function(callback) {
     MOTION_SENSOR.getStatus();
     callback(null, Boolean(MOTION_SENSOR.motionDetected));
});

var int = setInterval(() => {
  var d = new Date(Date.now());
  let alarms = db.get('alarms').value()
  alarms.forEach((a ,i) => {
    let time = new Date(a.time)
    //var h = d.getHours()+1 == 24 ? 0 : d.getHours()+1 //timezone 💩
    if(time.getMinutes() === d.getMinutes() && time.getHours() === d.getHours() && a.isActive == true){
      if(a.repeat==false) a.isActive = false
      ring()
      console.log('alarm');
    }
  })
}, 3000)

function formatTime(format, time) {
  switch (format) {
    case 'ios':
      return new Date(time.substr(6,4), time.substr(3,2), time.substr(0,2), time.substr(12,2), time.substr(15,2))
      break
    case 'javascript':
      return new Date(time)
    default:
  }
}

function ring() {
  MOTION_SENSOR.motionDetected = true;
  motionSensor
    .getService(Service.MotionSensor)
    .setCharacteristic(Characteristic.MotionDetected, MOTION_SENSOR.motionDetected);
  setTimeout(function () {
    MOTION_SENSOR.motionDetected = false;
    motionSensor
      .getService(Service.MotionSensor)
      .setCharacteristic(Characteristic.MotionDetected, MOTION_SENSOR.motionDetected);
  }, 10000);
}

app.get('/ring', (req, res) => {
  ring();
  res.send('ok')
})

app.get('/motion', (req, res) => {
  MOTION_SENSOR.motionDetected = true;
  motionSensor
    .getService(Service.MotionSensor)
    .setCharacteristic(Characteristic.MotionDetected, MOTION_SENSOR.motionDetected);
  res.send('ok')
})

app.get('/nomotion', (req, res) => {
  MOTION_SENSOR.motionDetected = false;
  motionSensor
    .getService(Service.MotionSensor)
    .setCharacteristic(Characteristic.MotionDetected, MOTION_SENSOR.motionDetected);
  res.send('ok')
})

app.post('/alarm', (req, res) => {
  if(req.body.format===undefined || req.body.time===undefined) {
    res.json({error: true, msg: 'No date or format given'})
    return
  }
  var id = shortid.generate()
  var d = formatTime(req.body.format, req.body.time)
  db.get('alarms')
    .push({id: id, time: d, isActive: true, repeat: (req.body.repeat==true)})
    .write()
  res.json({msg: 'Alarm set at ' + req.body.time.substr(12,5), alarm: db.get('alarms').find({id:id}).value(), error: false})
})

app.get('/alarms', (req, res) => {
  res.json(db.get('alarms'))
})

app.delete('/alarm', (req, res) => {
  db.get('alarms')
  .remove({id: req.query.id})
  .write()
  res.json({msg: 'deleted alarm', error: false, id: req.query.id})
})

app.put('/alarm',(req,res) => {
  if(req.body.id===undefined) {
    res.json({error: true, msg: 'No id given'})
    return
  }
  if(req.body.time!==undefined){
    if(req.body.format===undefined) {
      res.json({error: true, msg: 'No date format given'})
      return
    }
    db.get('alarms').find({id: req.body.id}).set('time', formatTime(req.body.format, req.body.time)).write()
  }
  if(req.body.isActive!==undefined) db.get('alarms').find({id: req.body.id}).set('isActive', req.body.isActive).write()
  if(req.body.repeat!==undefined) db.get('alarms').find({id: req.body.id}).set('repeat', req.body.repeat).write()
  res.json({error: false, msg: 'updated the alarm', alarm: db.get('alarms').find({id: req.body.id}).value()})
})

app.listen(port, () => console.log(`Example app listening on port ${port}!`))
