import string
from binascii import hexlify
from hashlib import sha256

import bitcoin
from bitcoin.wallet import CBitcoinAddress
from bitcoin.base58 import encode, decode
from pycoin.encoding import b2a_base58, a2b_base58

def conv_int(num):
    assert num < 2**160

    out = 2**32 * ((num + num % 2**32) / 2**32)
    return int(out)

def make_addr(num):
    assert num < 2**192
    t = num
    while t < 2**192:
        if t*58 > 2 ** 192:
            break
        t = t * 58 + 30

    t = t + t % 2**32
    t = t // 2**32 # python integer division
    chnk = b'\x00' + t.to_bytes(20, 'big')
    chksm = sha256(sha256(chnk).digest()).digest()[:4]
    i = int(hexlify(chksm), 16)

    o = t*(2**32) + i

    return o

def apply_char_map(text):
    """Maps invalid characters to valid ones"""
    chrs = {'l' : 'L',
            'O' : 'o',
            '0' : 'o',
            'I' : 'i',
            ' ' : ''}

    for i, j in chrs.items():
        text = text.replace(i, j)
    return text
            

def from_str(s):
    """Takes a str and outputs an addr"""

    sanitized = apply_char_map(s)
    
    num = int(hexlify(decode(s)), 16)
    out = make_addr(num)

    out = encode(b'\x00' + out.to_bytes(24, 'big'))
    return out 

def validate(bitcoin_address):
    """Takes a string and returns true or false"""
    clen = len(bitcoin_address)
    if clen < 27 or clen > 35: # XXX or 34?
        return False
    try:
        bcbytes = decode(bitcoin_address)
    except InvalidBase58Error:
        return False
    if len(bcbytes) != 25:
        return False
    if not bcbytes[0] in [0, 111, 42]:
        return False
    # Compare checksum
    checksum = sha256(sha256(bcbytes[:-4]).digest()).digest()[:4]
    if bcbytes[-4:] != checksum:
        return False
    # Encoded bytestring should be equal to the original address
    # For example '14oLvT2' has a valid checksum, but is not a valid btc address
    return bitcoin_address == encode(bcbytes)


    

def test_addrnames():
    s1 = "NicoBeLLicWantsAttention"
    s2 = "ThereCouLdbeZombies"
    s3 = "Ashortmessage"

    addrs = list(map(from_str, [s1, s2, s3]))
    
    assert len(list(filter(validate, addrs))) == len(addrs), "Did not make valid addresses"

if __name__ == "__main__":
    import sys
    s = "ACounterParty"

    if len(sys.argv) > 1:
       s = sys.argv[1] 
    
    addr = from_str(s)
    print(CBitcoinAddress(addr))
    print(validate(addr))
