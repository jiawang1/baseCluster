"use strict";
const util = require('util');
const StringDecoder = require('string_decoder').StringDecoder;
const Transform = require('stream').Transform;

util.inherits(jsonTransformStream, Transform);

function jsonTransformStream(){

	if (!(this instanceof jsonTransformStream))
    return new jsonTransformStream(options);

	Transform.call(this, { objectMode : true });
	this._buffer = "";
	this._decoder = new StringDecoder('utf8');
}

jsonTransformStream.prototype._transform = function(chunk, encoding, done){

	this._buffer += this._decoder.write(chunk);
	done();

};

jsonTransformStream.prototype._flush = function(done){
		try{
		  var obj = JSON.parse(this._buffer);
		}catch(err){
			console.error("transform error" + err);
		  	this.emit('error', err);
	      	return;
		}
		this.push(obj);
		done();

};

module.exports = jsonTransformStream;