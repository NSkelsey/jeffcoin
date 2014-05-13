if (typeof addrNames == "undefined") {var addrNames = {
  addressForStr : (function(){
    var bitcore = require('bitcore');
    var Address = bitcore.address;
    var base58  = bitcore.base58;
    var Buffer  = bitcore.Buffer;


    //Glorious base58 regex
    var addrRE = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{1,25}$/

    // Pro level js
    var two56 = new BigInteger('256', 10);
    // 2 ** 190 is limit for ints 
    var limit = (new BigInteger('2', 10)).pow(new BigInteger('192', 10));
    // 58 is our base
    var five8 = new BigInteger('58', 10);
    // X is 30 in decimal
    var pad = new BigInteger('30', 10);
    var twoTo32 = new BigInteger('4294967296', 10);
    var zero = new BigInteger('0', 10);

    //Version byte
    var ver = new Buffer([0])

    replaceAll = function(str) {
        fix = str.replace(/l/g, 'L')
        fix = fix.replace(/I/g, 'i')
        fix = fix.replace(/0/g, 'o')
        fix = fix.replace(/O/g, 'o')
        return fix
    }

    to_Buffer = function(num){
    // takes a BigInteger as input and returns the corresponding buffer
        var i = 0;    
        var accum = [];
        while (num.compareTo(zero) > 0){
            // num / 2^8
            var out = num.divideAndRemainder(two56);
            // set num to be the divisor
            num = out[0];
            var rem = out[1];
                            // So dangerous
            accum.push(Number(rem.toRadix(10)));
        }
        buf = new Buffer(accum.reverse())
        return buf
    }

    to_BigInt = function(buf){
    // takes a bitcore buffer as input and returns a BigInteger
        var num = new BigInteger('0', 10);
        for (var i = 0; i < buf.length; i++) {
            oneByte = buf.readUInt8(i).toString()
            v = new BigInteger(oneByte, 10);
            num = num.multiply(two56);
            num = num.add(v);
        }
        return num
    }

    joinBufs = function(a, b) {
        buf = new Buffer(a.toString('hex') + b.toString('hex'), 'hex');
        return buf
    }

    create_repr = function(num){
    // returns the numeric representation of the bitcoin address
        if (limit.compareTo(num) < 0) {
            throw("We would lose precision if we continued!")
        }
        while (limit.compareTo(num) > 0) {
            var tmp = num.multiply(five8);        
            if (limit.compareTo(tmp) < 0) {
                break;
            }
            // Makes trailing chars into w/e pad maps to
            num = tmp.add(pad);
        } 
        num = num.add(num.mod(twoTo32))     
        num = num.divide(twoTo32)
        var numBuf = to_Buffer(num)

        var chnk = joinBufs(ver, numBuf)
        var chksm = bitcore.util.twoSha256(chnk).slice(0,4);
        var i = to_BigInt(chksm)

        num = num.multiply(twoTo32)
        num = num.add(i)

        return num
    }

    addressForStr = function(str) {
        if (str.length > 25){
            throw("Input for human readable address is too long!")
        }
        var fixed = replaceAll(str);
        if (addrRE.exec(fixed)) {
            var b58 = base58.decode(fixed);
            var num = to_BigInt(b58);
            var out = create_repr(num);
            var buf = to_Buffer(out);
            joined = joinBufs(ver, buf)
            return base58.encode(joined);
        } else {
            throw("Invalid characters in string!")
        }

    };
    return addressForStr   
  })()
};};
