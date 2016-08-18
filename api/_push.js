'use strict';

const fs = require('fs');
const path = require('path');
const UUID = require('node-uuid');
const fstream = require('fstream');
const unzip = require('unzip');
const AV = require('leancloud-storage');
const conf = require('../ac-config.js');
const business = require('./business');

const APP_ID = conf.leancloud.APP_ID;
const APP_KEY = conf.leancloud.APP_KEY;
AV.init({
	appId: APP_ID,
	appKey: APP_KEY
});

module.exports = async (ctx, next) => {
	let body = ctx.req.body;
	let appId = body.appId;
	let moduleId = body.moduleId;
	let platform = body.platform;
	let author = body.author;
	let desc = body.description;
	let business = body.business;
	let classify = body.classify;
	
	let widget = ctx.req.file;

	if(!appId || !moduleId || !platform || !author || !widget) {
		ctx.status = 404;
		ctx.body = '必要参数缺失';
		return;
	}
	
	let uuid = UUID.v1();
	let wname = path.basename(widget.originalname, '.zip');
	let distDir = path.join(conf.warehouse, uuid);
	let jsonFile;

	await Promise.resolve().then(function() {
		// 检验白名单
		// 被坑了，Leancloud的单元操作并非真正的Promise，体现为异常的传递不一致
		// 在then中抛异常，后台直接跪了，而不是给它自己的catch捕获
		var query = new AV.Query('Account');
		query.equalTo('name', author);
		return new Promise(function(resolve, reject) {
			query.find().then(function (results) {
				if(results.length===0) {
					reject('用户不在白名单之列');
				} else {
					resolve();
				}
			});
		});
	}).then(function() {
		// 创建组件文件夹
		fs.mkdirSync(distDir);
		// 拷贝文件到新文件夹
		return new Promise(function(resolve, reject) {
			let readStream = fs.createReadStream( widget.path );
			let writeStream = fstream.Writer(distDir);
			readStream
				.pipe(unzip.Parse())
				.pipe(writeStream);
			writeStream.on('close', function() {
				resolve();
			});
		});
	}).then(function() {
		// 指定的business是否存在
		if(business) {
			return new Promise(function(resolve, reject) {
				var query = new AV.Query('Business');
				query.get(business).then(function (data) {
					resolve();
				}, function (error) {
					reject('指定业务不存在');
				});
			});
		}
	}).then(function() {
		// 指定的classify是否存在
		if(classify) {
			return new Promise(function(resolve, reject) {
				var query = new AV.Query('Classify');
				query.get(classify).then(function (data) {
					resolve();
				}, function (error) {
					reject('指定类别不存在');
				});
			});
		}
	}).then(function() {
		// 读取配置文件
		jsonFile = fs.readFileSync( path.join(distDir, wname+'.json') );
		// 存数据库
		let wc = JSON.parse( jsonFile.toString() );
		var widget = new AV.Object('Widget');

		// https://leancloud.cn/docs/relation_guide-js.html#使用_Pointers_实现一对多关系
		if(business) {
			var bus = AV.Object.createWithoutData('Business', business);
			widget.set('business', bus);
		}
		if(classify) {
			var cls = AV.Object.createWithoutData('Classify', classify);
			widget.set('classify', cls);
		}

		return widget.save({
			name: wname,
			desc: desc || wc.desc || '',
			appId: appId,
		  	moduleId: moduleId,
		  	author: author || wc.author || '',
		  	platform: (platform==='h5' || platform==='pc') ? platform : 'h5', // h5 | pc, default h5
		  	folder: uuid
		});
	}).then(function(wid) {
		// Response
		ctx.status = 200;
		ctx.body = JSON.stringify({
			no: 0,
			data: {
				id: wid
			}
		});
	}).catch(function(err) {
		console.error(err);
		ctx.status = 403;
		ctx.body = err;
	});
}