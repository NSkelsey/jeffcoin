import re, json
from datetime import datetime
from binascii import a2b_hex
from functools import reduce

from sqlalchemy import (Column, String, LargeBinary,
                        Enum, ForeignKey, create_engine,
                        Integer, Table)
from sqlalchemy import orm
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship

from pycoin.encoding import public_pair_to_bitcoin_address, sec_to_public_pair

import utils
from config import DB_NAME, NETWORK

engine = create_engine('sqlite:///{}'.format(DB_NAME), echo=True)
Base = declarative_base()
Session = sessionmaker(bind=engine)

class Address(Base):
    __tablename__ = 'addresses'

    addr = Column(String, primary_key=True)
    txs = relationship("Bulletin", backref='addresses', secondary='tx_relations')
    type = Column(Enum('address', 'username', 'topic'))

    @orm.reconstructor
    def build(self):
        self.__init__(self.addr)
    
    __mapper_args__ = {'polymorphic_identity': 'address',
                       'polymorphic_on': type}

class TxRelation(Base):
    __tablename__ = 'tx_relations'

    addr = Column(ForeignKey('addresses.addr'), primary_key=True)
    txid = Column(ForeignKey('transactions.txid'), primary_key=True)
    #role = Column(Enum('TO', 'FROM'))
    
class Bulletin(Base):
    """Fields:
       txid
       creator
       tx
       body
       meta 
       date_created
       coords
       topics
       usertags
       confirms[?]
    """ 
    __tablename__ = 'transactions'
    op_ret_gex = r'^-- [a-zA-Z0-9\.]+ --'

    txid = Column(String, primary_key=True)
    tx = Column(LargeBinary)
    tx_dict = Column(String)
    confirms = Column(Integer)
    
    
    @orm.reconstructor
    def defaults(self):
        # essentials
        self.tx = a2b_hex("dead")
        self.body = "The troops are having a blast here! Simon Ostrovsky got taken to hang out with for a day or two."
        self.meta = "-- ahimsa-0.0.1 -- 2014-05-13 19:26:26 (38.0299, 78.4790)"
        self.topics = []
        self.usertags = []
        self.creator = Username("1nskeLsey2t4uz9UurqJb8vLt9o7vh6J")

        # demo consts
        s1 = Topic('1vioLenceXinXsLavyanskXXXXXZbxjqZ')
        s2 = Topic('1maskedXrussianXfrogmenXXXXX3UKRa')

        self.date_created = datetime.now()
        self.date_est = datetime.now()
        self.confirms = 27
        if self.tx_dict is not None:
            self.proccess_tx_dict(json.loads(self.tx_dict))


    def proccess_tx_dict(self, tx_dict):
        """Process a json tx_dict provided by insight-api"""
        self.creator = Username.parse_sig(tx_dict['vin'][0]['scriptSig']['asm'])
        self.txid = tx_dict['txid']
        self.confirms = tx_dict['confirmations']
        vout = tx_dict['vout']

        self.date_created = utils.est_date(self.confirms)

        def topicReduce(acc, txout):
            s = txout['scriptPubKey']
            addrs = s.get('addresses')
            if addrs is not None and Topic.is_valid(addrs[0]):
                return acc.append(Topic(addrs[0]))
            return acc
            
        address = list(reduce(topicReduce, vout, []))

        if len(vout) > 2:
            addr = vout[1]['scriptPubKey']['addresses'][0]
            if Topic.is_valid(addr):
                self.topics.append(Topic(addr))
            else:
                self.usertags.append(Username(addr))
        
        meta_body = Bulletin.decode_utf(vout[-1])    
        self.body = re.sub(self.op_ret_gex, '', meta_body)
     
    @staticmethod
    def decode_utf(txout):
        try:
            asm = txout['scriptPubKey']['asm']
            if 'OP_RETURN' in asm:
                _hex = asm.split[' '][1]
                return str(unhexlify(_hex), 'utf-8')
            return "It broke"
        except Exception as e:
            print(e)
            return ""
     
    @staticmethod
    def is_valid(tx_dict):
        vout = tx_dict['vout']
        if len(vout) < 3:
            return False
        meta_body = Bulletin.decode_utf(vout[-1])
        m = re.match(Bulletin.op_ret_gex, meta_body)
        if m is None:
            return False
        return True

    def __init__(self, raw_hex=None, tx_dict=None):
        """Constructs a bulletin from a provided raw hex string"""
        self.defaults()

        if tx_dict is not None:
            self.tx_dict = json.dumps(tx_dict)
            self.proccess_tx_dict(tx_dict)
           
    def time_diff(self):
        return "3 hours" 

    def __repr__(self):
        return "<Txid:{}, Author:{}, Body:{}, confirms:{}>".format(self.txid, self.creator, self.body, self.confirms)

class Username(Address):
    """Fields:
        addr
        name
        checksum
    """
    __mapper_args__ = {'polymorphic_identity': 'username'}

    @staticmethod
    def parse_sig(script_hex):
        """Takes a hex string of the script signature and returns the corresponding user obj
        Its in the format: [3a05e435... 027efd7...]
                    where: [Signature,  Sec_pubkey]

        """         
        
        pubkey_hex = script_hex.split(' ')[1]
        sec = sec_to_public_pair(a2b_hex(pubkey_hex))
        addr = public_pair_to_bitcoin_address(sec, address_prefix=NETWORK)
        return Username(addr)

    def from_count(self):
        num = 0
        for tx in self.txs:
            if tx.creator == self:
                num += 1
        return num

    def to_count(self):
        total = len(self.txs)
        return total - self.from_count()

    def satoshis_burned(self):
        num = len(self.txs)
        sats = 547 * 7 * num
        return sats 

    def fees_paid(self):
        num = len(self.txs)
        fee = 0.0001 * num
        return fee

    def __init__(self, addr):
        self.addr = addr
        self.name = addr[1:8]
        self.checksum = addr[-4:]

    def __str__(self):
        return "{} {}".format(self.name, self.checksum)


class Topic(Address):
    """Fields:
        addr
        title
    """    
    __mapper_args__ = {'polymorphic_identity': 'topic'}
    addr_re = r'^[a-zA-Z1-9]([a-zLX1-9]+)X+[a-zA-Z0-9]{5,7}$'

    def __init__(self, addr):
        self.addr = addr
        self.make_human()
   
    @classmethod
    def is_valid(cls, addr):
        m = re.match(cls.addr_re, addr)
        if m is None: 
            return False
        else:
            return True

    @staticmethod
    def apply_transforms(pre_str):
        t = pre_str.replace('X', ' ')
        t = t.replace('L', 'l')
        # replace all o's next to numbers with 0
        def createZeros(match):
            g = match.groups()
            s = (g[0] or g[1]) # (None, 'oo47')
            return s.replace('o', '0')

        zeds = r'(o+[1-9]+)|([1-9]+o+)'
        t = re.subn(zeds, createZeros, t)[0]
        t = t.title()
        t = t.strip()
        return t

    def make_human(self):
        assert Topic.is_valid(self.addr), 'Bad topic address'
        match = re.match(self.addr_re, self.addr)
        pre = match.groups()[0] 
        post = Topic.apply_transforms(pre)
        self.title = post


def test_addr(cond, tup):
    (addr, target) = tup
    print(tup)
    
    test = Topic.is_valid(addr) 
    if not (cond == test): print("Guessed Wrong")

    if cond:
        t = Topic(addr)
        print(t.title)
        print(t.title == target) 

def test_address_parsing():    
    good_addr = ('1thisXisXaXtravestyXXXXXXXXY6f4YE', 'This Is A Travesty')
    bad_addr = ('1thiSXisXaXtEStyXXXXXXXXY6f4YE', None)
    still_bad_addr = ('1thisXisXaXtEStyXXXXXXXXY6f4YE', None)
    num_addr = ('1tho1X14oo54XaXtr2oo7vestyXbGYnmC', 'Th01 140054 A Tr2007Vesty')

    test_addr(False, bad_addr) 
    test_addr(False, still_bad_addr) 
    test_addr(True, num_addr) 
    test_addr(True, good_addr) 

def generate_test_data():
    s = Session()
    import json

    _raw = open('txs.json').read()
    txs = json.loads(_raw)

    topic = Topic('1thisXisXaXtravestyXXXXXXXXY6f4YE')
    s.add(topic)
    for tx_dict in txs:
        b = Bulletin(tx_dict=tx_dict)   
        user = b.creator
        s.add(b)
        s.add(user)
        b.addresses.append(topic)
        b.addresses.append(user)
    s.commit()


if __name__ == '__main__':
    Base.metadata.create_all(engine)
    generate_test_data() 
