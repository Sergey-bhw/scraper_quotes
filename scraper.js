let needle = require('needle');
let cheerio = require('cheerio');
let async = require('async');
let fs = require('fs');
let sqlite3 = require('sqlite3').verbose();
let path = require('path');

let options = {
	//proxy: '127.0.0.1:8888',
	headers: {
		'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.84 Safari/537.36',
		// 'Connection': 'keep-alive',
		// 'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
		// 'Accept-Encoding':'gzip, deflate',
		// 'Accept-Language':'ru,en-US;q=0.8,en;q=0.6',
		// 'Referer':'https://twitter.com/',
		// 'Origin':'https://twitter.com'
	},
	follow_max: 2
};

let quotes = {};
let lastInsert = new Date();
var db = new sqlite3.Database(path.resolve(__dirname, 'quotes.db'));
db.run(`CREATE TABLE IF NOT EXISTS quotes (quote TEXT PRIMARY KEY NOT NULL, author TEXT)`);

let q = async.queue((job, done) => {
	if(job == 'https://www.brainyquote.com'){ //home page
		needle.get(job, (err, res) => {
			let $ = cheerio.load(res.body, {decodeEntities: false});
			$('.bq-tn-wrap > a').each(function(){
				//console.log('https://www.brainyquote.com' + $(this).attr('href'));
				q.push('https://www.brainyquote.com' + $(this).attr('href'));
			});
			done();
		});
	}else if(job.match(/authors\/[a-z]([0-9]{1,3})?$/i)){ //letters page
		needle.get(job, (err, res) => {
			if(err || !res){
				done();
			}else{
				let $ = cheerio.load(res.body, {decodeEntities: false});
				$('table tr[onclick]').each(function(){ //push first author page
					let toPush = 'https://www.brainyquote.com' + $(this).find('a').attr('href') + '?vm=l';
					//console.log(toPush);
					q.push(toPush);
				});
				if(!$('.bq_s ul.pagination > li:last-child').hasClass('disabled')){ //push next page in letter page
					let href = $('.bq_s ul.pagination > li:last-child').find('a').attr('href');
					//if(href) console.log('pushed ' + href);
					if(href) q.push('https://www.brainyquote.com' + href);
				}
				done();
			}
		});
	}else{ //single author each page
		needle.get(job, (err, res) => {
			if(err || !res){
				done();
			}else{
				let $ = cheerio.load(res.body, {decodeEntities: false});

				let current = new Date();
				if(current - lastInsert > 1000 * 60 * 2){
					db.serialize(function(){
						db.run("BEGIN TRANSACTION");
						var stmt = db.prepare(`REPLACE INTO quotes VALUES (?, ?)`);
						for(let author in quotes){
							if(quotes.hasOwnProperty(author)){
								for (var i = 0; i < quotes[author].length; i++) {
									stmt.run(quotes[author][i], author);
								}
							}
						}
						stmt.finalize();
						db.run("COMMIT");
						lastInsert = current;
						quotes = {};
					});
				}

				$('#quotesList .boxy').each(function(){ //process quotes from author page
					let quote = $(this).find('.clearfix > a').eq(0).text();
					let author = $(this).find('.clearfix > a').eq(1).text();
					if(!quotes[author]) quotes[author] = [];
					quotes[author].push(quote);
					console.log(author + ': ' + quotes[author].length);
				});
				if(!$('.quote-nav-msnry ul.pagination > li:last-child').hasClass('disabled')){ //push next page in author page
					let href = $('.quote-nav-msnry ul.pagination > li:last-child').find('a').attr('href');
					//if(href) console.log('pushed ' + href);
					if(href) q.push('https://www.brainyquote.com' + href + '?vm=l');
				}
				done();
			}
		});
	}
}, 40);
q.drain = () => {
	db.serialize(function(){
		db.run("BEGIN TRANSACTION");
		var stmt = db.prepare(`REPLACE INTO quotes VALUES (?, ?)`);
		for(let author in quotes){
			if(quotes.hasOwnProperty(author)){
				for (var i = 0; i < quotes[author].length; i++) {
					stmt.run(quotes[author][i], author);
				}
			}
		}
		stmt.finalize();
		db.run("COMMIT");
	});
};

q.push('https://www.brainyquote.com');