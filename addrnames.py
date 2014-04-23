from binascii import hexlify
from hashlib import sha256

import bitcoin
from bitcoin.base58 import encode, decode
from pycoin.encoding import b2a_base58, a2b_base58

def conv_int(num):
    assert num < 2**160

    out = 2**32 * ((num + num % 2**32) / 2**32)
    return int(out)

def make_addr(num):
    assert num < 2**160
    t = num
    while t < 2**160:
        if t*58 > 2 ** 160:
            break
        t = t * 58 + 30

    t = t + t % 2**32
    t = t // 2**32 # python integer division
    chnk = b'\x00' + t.to_bytes(20, 'big')
    chksm = bitcoin.core.Hash(chnk)[:4]
    #chksm = sha256(sha256(t.to_bytes(160, 'big')).digest()).digest()[:4]
    i = int(hexlify(chksm), 16)
    o = t*(2**32) + i

    return int(o)


def from_str(s):
    """Takes a str and outputs an addr"""
    
    num = int(hexlify(decode(s)), 16)
    out = make_addr(num)

    out = encode(b'\x00' + out.to_bytes(20, 'big'))
    return out 
    

if __name__ == "__main__":
    s = "hashtagWAGWAG"
    
    from_str(s)
    print(from_str(s))
