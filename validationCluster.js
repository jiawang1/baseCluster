  "user strict";
  const cluster = require('cluster'),
        fs = require('fs'),
        Console = console.Console,
        path = require("path");
  const numCPUs = require('os').cpus().length;

  function EngineMaster(){
    if(!(this instanceof EngineMaster)){
      return new EngineMaster(arguments);
    }
    this.isRefreshing = false;
    this.initialWorkers = 0;
    this.workerIds = [];
    this.killingHandler = [];
    this.workerEnv = {};
    this.__init();
  }

  EngineMaster.prototype.__init = function(){

    console.log("start to load configuration from cluster_config.json");
    var config = this.__readConfig('cluster_config.json');
    if(typeof config !== "undefined"){
      this.workerEnv.hostname = config.hostname;
      this.workerEnv.port = config.port;
      this.workerEnv.path = path.normalize("/" + config.path);
      if(EngineMaster.isNumeric(config.workerCount)){
        this.initialWorkers = config.workerCount - 0;
      }else{
        this.initialWorkers = Math.max(numCPUs-3,2);
      }
    }else{
      console.error("failed to laod configuration, server shutdown");
      return;
    }
  };

  EngineMaster.isNumeric = function(num){
    return num - parseFloat(num) >= 0;
  };

  EngineMaster.prototype.startCluster = function(){
          for (var i = 0; i < this.initialWorkers; i++) {
            this.__startWorker();}
            console.log('Master cluster startup up ' + this.initialWorkers + ' workers...');
              cluster.on('online', (worker) => {
                console.log('Worker ' + worker.process.pid + ' is online');
              });

              cluster.on('exit', (worker, code, signal) => {

                if (this.workerIds.indexOf(worker.id) >= 0) {
                  console.log("worker " + worker.proccess.pid + " died with code " + code + " signal " + signal);
                  this.workerIds.splice(this.workerIds.indexOf(worker.id), 1);
                  var _wroker = cluster.fork();
                  this.workerIds.push(_wroker.id);
                } else {
                  console.log("worker " + worker.process.pid + "is shutdown by master, code " + code + " signal " + signal);
                }
              });

              fs.watch("./cluster_config.json", (event, fileName) => {
                if (event === "change") {
                    this.__refreshServer(fileName, 0);
                }
              });
  };

  EngineMaster.prototype.__readConfig = function(fileName){
          try {
                var chunk = fs.readFileSync(fileName);
              } catch (err) {
                console.error('read configuration file failed');
                console.error(err.stack);
                this.isRefreshing = false;
                return;
              }

            try {
              var config = JSON.parse(chunk.toString());
            } catch (err) {
              console.error('resolve config content failed');
              console.error(err.stack);
              this.isRefreshing = false;
              return;
            }
            return config;
  };


  EngineMaster.prototype.__refreshServer = function(fileName, count, forceRefresh){
      if(!this.isRefreshing || forceRefresh){
          this.isRefreshing = true;
          if (this.killingHandler.length > 0) {

              if(count >=3){
                console.error("waiting timeout for process killing process, some process can not be exit, server refresh give up");
                this.isRefreshing = false;
                return;
              }else{
                setTimeout(this.__refreshServer.bind(this, fileName, ++count, true), 5000);
                console.log("waiting next tick, since current handler is " + this.killingHandler.length);
              }

          } else {
              console.log('configuration changed, server start to refresh');
              var config = this.__readConfig(fileName);

            if(config && EngineMaster.isNumeric(config.workerCount)){
                var _changeNum = 0;
                config.workerCount = config.workerCount - 0;
                if ((_changeNum = config.workerCount - this.workerIds.length) > 0) {
                  for (var i = 0; i < _changeNum; i++) {
                    this.__startWorker();
                  }
                } else if (_changeNum < 0) {
                  for (var i = 0; i < Math.abs(_changeNum); i++) {
                    this.__killWorker(this.workerIds[i], this.workerIds);
                  }
                }
            }else{
              console.error('failed to load configuration or configuration error, workerCount should be Numeric, current value is ' + config.workerCount);
            }
            this.isRefreshing = false;
          }
      }else{
          console.error("refresh request is ignored since server is refreshing currently");
          return;
      }
  };

  EngineMaster.prototype.__killWorker = function(id){

        if (this.workerIds.indexOf(id) >= 0) {
            cluster.workers[id].send({
              type: "shutdown",
              source: "master"
            });
          this.workerIds.splice(this.workerIds.indexOf(id), 1);

          var handler = setTimeout(() => {
              (this.killingHandler.indexOf(handler) >= 0) && this.killingHandler.splice(this.killingHandler.indexOf(handler), 1);
              if (cluster.workers[id]) {
                cluster.workers[id].kill('SIGKILL');
              }
          }, 5000);
          this.killingHandler.push(handler);
        }

  };

  EngineMaster.prototype.__startWorker = function(){
      var _wroker = cluster.fork(this.workerEnv);
      this.workerIds.push(_wroker.id);
  };

  if (cluster.isMaster) {
    new EngineMaster().startCluster();
  }else{
    ["log","error","info", "warn"].forEach((name)=>{
        var __orig = console[name];
        console[name] = function(){
             arguments[0] = "[Worker " + process.pid + " "+ name +"] : "+arguments[0];
              __orig.apply(console, [].slice.apply(arguments));
        };
    });

    require("./validatorserver.js");
    process.on("message", (message) => {
      if (message.type === "shutdown") {
        process.exit(0);
      }
    });
    console.log('Worker ' + process.pid + ' is startup!');
  }