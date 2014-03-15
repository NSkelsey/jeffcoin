from datetime import datetime

import sqlite3
from flask import Flask
from flask import render_template, request, jsonify
from flask import g
from markdown2 import Markdown
 
from btc_api import retrieve_posts, store_post, InsufficientFunds, compute_fee, coins_left
from forms import PostForm


DB_PATH = './test.db'
DATE_F = "%Y-%m-%d %H:%M:%S"

app = Flask(__name__)

markdowner = Markdown()

app.jinja_env.globals['render_markdown'] = markdowner.convert
app.jinja_env.filters['compute_fee'] = compute_fee
 
def connect_to_db():
    return sqlite3.connect(DB_PATH) 
                
     
def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = connect_to_db()
    return db

@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, '_database', None)
    if db is not None:
        db.commit()
        db.close()
        


@app.route('/') 
def home():     
    """Shows all posts stored by our service"""
    cur = get_db().cursor()
    txs = cur.execute('select * from p_transactions').fetchall()
    txids = [tx[0] for tx in txs]

    posts = retrieve_posts(txids)
    dates = [datetime.strptime(tx[2], DATE_F) for tx in txs]
    posts = list(map(lambda x: dict(x[0], date=x[1]), zip(posts, dates)))

    posts.sort(key=lambda x: x['tx_dict'].get('confirmations', 0))
    # time diff calculation
    def diff_t(post):
        created = post['date']
        if not post['tx_dict'].get('confirmations', False):
            return "N/A" 
        stored = datetime.fromtimestamp(post['tx_dict']['blocktime'])
        return stored - created

    posts = list(map(lambda x: dict(x, time_diff=diff_t(x)), posts))
    coin = str(coins_left())
    return render_template('home.html', posts=posts, coin=coin)

@app.route('/create/')
def editor():
    post = {'body': 'change me too', 'title': 'change me'}
    form = PostForm()
    return render_template('editor.html', post=post, form=form)

@app.route('/posts/', methods=['POST'])
def create_post():
    """Creates a post a puts it in the block chain and stores it locally"""
    if not request.json:
        abort(400)
    form = PostForm.from_json(request.json, skip_unkown_keys=False)
    if form.validate():
        post = {'body': form.data['body'],
               'title': form.data['title'],
               'date': datetime.now()
              } 

        try:
            txid = store_post(post)
            cur = get_db().cursor()
            cur.execute('INSERT INTO p_transactions VALUES (?, ?, ?)', (txid, post['title'], post['date'].strftime(DATE_F)))
            # cursor should close 
            return jsonify(**post), 201
        except InsufficientFunds as e:
            return jsonify(error=str(e))
            
    else:
        jsonify(error='Your form did not validate')

if __name__ == "__main__":
    app.run(debug=True, host='0.0.0.0')

