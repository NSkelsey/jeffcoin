from datetime import datetime


import sqlite3
from flask import Flask
from flask import render_template, request, jsonify
from flask import g
from flask.ext.sqlalchemy import SQLAlchemy
from werkzeug.contrib.fixers import ProxyFix
from markdown2 import Markdown
 
import config
import filters
from models import Base, Address, Bulletin, Topic, Username
from utils import secrets_for_post


DEV = False
DATE_F = "%Y-%m-%d %H:%M:%S"

app = Flask(__name__)
app.config.from_object(config)
app.wsgi_app = ProxyFix(app.wsgi_app)

markdowner = Markdown()

app.jinja_env.globals['render_markdown'] = markdowner.convert
app.jinja_env.filters['nice_date'] = filters.nice_date

db = SQLAlchemy(app)
db.Model = Base

@app.route('/')
def home():
    recent = db.session.query(Bulletin).first() 
    recent.body = "This is a sample message that demonstrates that you can store all sorts of things in the blockchain. Not just transactions"
    recent.creator = Username('mnickskeLAByW5VtyKS94bcc2HJdqnU4wz')
    recent.usertags.append(Username('malex53WsAByW5VtyKS94bcc2HJdqnU4wz'))
    return render_template('home.html', live_demo=recent)  

@app.route('/create/')
def create():
    bitcoin_params = secrets_for_post()
    return render_template('bulletin.html', bitcoin_params=bitcoin_params)

@app.route('/recent/')
def browse():
    posts = db.session.query(Bulletin).limit(50)
    recent = Topic('1recentXXXXXXXXXXXXXXXXXXXXbAThAZ')
    return render_template('topic.html', topic=topic, bulletins=recent.bulletins)

@app.route('/<string:target>/')
def render(target):
    path = target + '.html'
    return render_template(path)

@app.route('/all/')
def all_addresses():
    topics = db.session.query(Topic).all()
    users = db.session.query(Username).all()
    return render_template('all_addresses.html', topics=topics, usernames=users)

@app.route('/addr/<string:addr>/')
def single_addr(addr):
    obj = db.session.query(Address).get(addr)
    if obj is None:
        return render_template('404.html', message='We have no record of this address! Which may or may not be a serious problem.'), 404
    if type(obj) == Topic:
        topic = obj
        bulletins = topic.txs
        bulletins[0].topics.append(obj)
        bulletins[0].topics.append(obj)
        return render_template('topic.html', topic=topic, bulletins=bulletins)
    else:
        user = obj
        t = Topic('1maskedXrussianXfrogmenXXXXX3UKRa') 
        print(user)
        bulletins = user.txs
        bulletins[0].topics.append(t)
        user.txs.append(bulletins[0])
        return render_template('user.html', user=user, bulletins=bulletins)

@app.route('/tx/<string:txid>/')
def single_bulletin(txid):
    bulletin = db.session.query(Bulletin).get(txid)
    return render_template('single.html', bulletin=bulletin)


if __name__ == "__main__":
    if DEV:
        app.run(debug=True, host='0.0.0.0')
    else: 
        app.run()
