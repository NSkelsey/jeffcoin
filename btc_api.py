import io
import sys 
import random
import os 
import jsonrpc 
import struct 
from datetime import datetime
from decimal import Decimal
from binascii import crc32,hexlify,unhexlify 

from bitcoinrpc.authproxy import JSONRPCException


class InsufficientFunds(Exception):
    def __init__(self, expected, actual):
        diff = Decimal(expected) - Decimal(actual)
        val = "Needed: {:.8f} got {:.8f}, Account is short {:.8f}".format(expected, actual, diff)
        self.value = val

    def __str__(self):
        return repr(self.value)
  
COIN = 100000000

proxy = jsonrpc.ServiceProxy(os.environ['BTCRPCURL'])

def unhexstr(str):
    return unhexlify(str.encode('utf8'))

def select_txins(value):
    unspent = list(proxy.listunspent())
    random.shuffle(unspent)

    r = []
    total = 0
    for tx in unspent:
        total += tx['amount']
        r.append(tx)

        if total >= value:
            break

    if total < value:
        raise InsufficientFunds(value, total)
    else:
        return (r, total)

def varint(n):
    if n < 0xfd:
        return bytes([n])
    elif n < 0xffff:
        return b'\xfd' + struct.pack('<H',n)
    else:
        assert False

def packtxin(prevout, scriptSig, seq=0xffffffff):
    return prevout[0][::-1] + struct.pack('<L',prevout[1]) + varint(len(scriptSig)) + scriptSig + struct.pack('<L', seq)

def packtxout(value, scriptPubKey):
    return struct.pack('<Q',int(value*COIN)) + varint(len(scriptPubKey)) + scriptPubKey

def packtx(txins, txouts, locktime=0):
    r = b'\x01\x00\x00\x00' # version
    r += varint(len(txins))

    for txin in txins:
        r += packtxin((unhexstr(txin['txid']),txin['vout']), b'')

    r += varint(len(txouts))

    for (value, scriptPubKey) in txouts:
        r += packtxout(value, scriptPubKey)

    r += struct.pack('<L', locktime)
    return r

OP_CHECKSIG = b'\xac'
OP_CHECKMULTISIG = b'\xae'
OP_PUSHDATA1 = b'\x4c'
OP_DUP = b'\x76'
OP_HASH160 = b'\xa9'
OP_EQUALVERIFY = b'\x88'
def pushdata(data):
    assert len(data) < OP_PUSHDATA1[0]
    return bytes([len(data)]) + data

def pushint(n):
    assert 0 < n <= 16
    return bytes([0x51 + n-1])


def addr2bytes(s):
    digits58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
    n = 0
    for c in s:
        n *= 58
        if c not in digits58:
            raise ValueError
        n += digits58.index(c)

    h = '%x' % n
    if len(h) % 2:
        h = '0' + h

    for c in s:
        if c == digits58[0]:
            h = '00' + h
        else:
            break
    return unhexstr(h)[1:-4] # skip version and checksum

def checkmultisig_scriptPubKey_dump(fd):
    data = fd.read(65*3)
    if not data:
        return None

    r = pushint(1)

    n = 0
    while data:
        chunk = data[0:65]
        data = data[65:]

        #padding to fill out 65 bytes of addr
        if len(chunk) < 33:
            chunk += b'\x00'*(33-len(chunk))
        elif len(chunk) < 65:
            chunk += b'\x00'*(65-len(chunk))

        r += pushdata(chunk)
        n += 1

    r += pushint(n) + OP_CHECKMULTISIG
    return r

def estimates(data, FEEPERKB):
    # typically about 7.3% of the whole txn is not actual data
    size = int(1.1*len(data))
    cost = FEEPERKB * 2*Decimal(size/1000.0)
    return (size, cost)


def store_post(post):

    data = bytearray(post['body'], 'utf-8')

    # appends len + crc32 of entire file to front
    data = struct.pack('<L', len(data)) + struct.pack('<L', crc32(data)) + data
    fd = io.BytesIO(data)

    FEEPERKB = Decimal(0.001)
   
    txouts = []
    (est_size, est_cost) = estimates(data, FEEPERKB)
    print("Est Size: %d Est Cost: %2.8f" % (est_size, est_cost))

    (txins, change) = select_txins(est_cost)

    if change < est_cost:
        print("Only found %2.8f BTC" % change)
        return ""

    while True:
        scriptPubKey = checkmultisig_scriptPubKey_dump(fd)
        if scriptPubKey is None:
            break
        value = Decimal(1/COIN)
        txouts.append((value, scriptPubKey))
        change -= value

    # change output
    change_addr = proxy.getnewaddress()
    txouts.append([change, OP_DUP + OP_HASH160 + pushdata(addr2bytes(change_addr)) + OP_EQUALVERIFY + OP_CHECKSIG])

    tx = packtx(txins, txouts)
    signed_tx = proxy.signrawtransaction(hexlify(tx).decode('utf8'))

        
    fee = Decimal(len(signed_tx['hex'])/1000) * FEEPERKB
    change -= fee

    txouts[-1][0] = change

    tx = packtx(txins, txouts)
    signed_tx = proxy.signrawtransaction(hexlify(tx).decode('utf8'))
    assert signed_tx['complete']

    print('Size: %d  Fee: %2.8f' % (len(signed_tx['hex'])/2,fee),file=sys.stderr)
    print('TxOuts: %d ' % len(txouts))

    txid = proxy.sendrawtransaction(signed_tx['hex'])
    return txid

 
def get_post(txid): 
    tx = proxy.getrawtransaction(txid,1) 
    data = b'' 
    for txout in tx['vout'][0:-1]: 
        for op in txout['scriptPubKey']['asm'].split(' '): 
            if not op.startswith('OP_') and len(op) >= 40: 
                data += unhexlify(op.encode('utf8')) 
      
    length = struct.unpack('<L', data[0:4])[0] 
    checksum = struct.unpack('<L', data[4:8])[0] 
    body = data[8:8+length] 
      
    if checksum != crc32(data): 
        print("DATA is corrupted!") 
    return (body, tx)
 
def retrieve_posts(txids):
    posts = [] 
    for txid in txids: 
        post = {}
        try: 
            (body, tx_d) = get_post(txid) 
            post = {'body': body,  
                    'title': txid[:15] + '...',
                    'date': datetime.now(),
                    'id': txid,
                    'tx_dict': tx_d,
                   }
        except JSONRPCException as e:
            post = {'body': str(e) + 'bitcoin rpc error!',
                    'title': txid[:15] + '...',
                    'id': txid}    
            print("Transaction id: {} broke".format(txid))
        posts.append(post)
    return posts


