var bitcore = require('bitcore');
var networks = bitcore.networks;
var Script = bitcore.Script;
var Address = bitcore.Address;
var base58 = bitcore.base58
var COIN = bitcore.util.COIN;
var TransactionBuilder = bitcore.TransactionBuilder;
var TransactionOut = bitcore.Transaction.Out;
var PeerManager = require('soop').load('bitcore/PeerManager', {
    network: networks.testnet
});

var MAX_OP_RETURN_RELAY = 40;
var MIN_TX_OUT = 0.0001;


var c = require('./rpc.js');
var conn = c.getRPCConnection();

// chunk is a utf string
function createSmallData(chunk){

    // as defined by our friends at https://github.com/bitcoin/bitcoin/blob/ae7e5d7cebd9466d0c095233c9273e72e88fede1/src/script.h#L212
    var OP_SMALLDATA = 249; 
    var script = new Script();

    script.writeOp(OP_SMALLDATA);
    script.writeBytes(chunk);

    if (script.length > MAX_OP_RETURN_RELAY) {
        throw "Script too large, len: " + script.length;
    }
    return script;
}


// pass in a msg to send and get the output needed to form a valid txn
function createCheapOuts(msg){
    // deal with script generation
    var raw = new Buffer(msg);

    if (raw.length > 140) {
        throw "This is twitter not some blog service"
    } 

    // round up
    var numOuts = Math.ceil(raw.length / MAX_OP_RETURN_RELAY);
    var outs = [];

    for (var i = 0; i < numOuts; i++){
    
        var msgWidth = MAX_OP_RETURN_RELAY - 1,
            slice = raw.slice(0, msgWidth),
            script = createSmallData(slice)
            raw = raw.slice(msgWidth);

        var data = {
            script: script,
            value: MIN_TX_OUT * COIN
        }; 
        var txOut = new TransactionOut();
        txOut.v = data.value;
        txOut.s = data.script;
        outs.push(txOut);
        console.log(typeof txOut.serialize);
    }
    console.log(outs)
    return outs
}


function encodeAddr(input_bin){
    if (input_bin.length > 20) {
        throw("input must be less than 20 bytes long");
    } 

    empt = String.fromCharCode(66)
    pad = Array(20 - input_bin.length + 1).join(empt)
    bin = new Buffer(input_bin + new Buffer(pad));

                // testnet address version
    var ver = networks.testnet.addressVersion
    var addr = new Address(ver, bin);
    return addr.toString()
}

function decodeAddr(address){
    var raw = base58.decode(address); 
    data = raw.slice(1, 21);
    
    str = data.toString('utf-8');

    return str
}
 
function createAddressOuts(msg) {
// finds DER encodings of public keys that are actually utf character encodings
    var buf = new Buffer(msg);    
    if (buf.length > 140) {
        throw("This is twitter damnit");
    }
    var numNeeded = Math.ceil(buf.length / 20);
    var outs = []

    for (var i = 0; i < numNeeded; i++){
        var slice = buf.slice(0, 20);
        buf = buf.slice(20);
        
        var addr = encodeAddr(slice)
        txout = {
            address: addr,
            amount: MIN_TX_OUT
        };
        outs.push(txout);
    }
    return outs
}

function hashtagStr(str) {
// centers and pads a hashtag
    if (str.length > 20) {
       throw("provided address must be maximum 20 bytes")
    }
    var lenPad = (20 - str.length)/2 + 1,
        leftPad = Array(Math.ceil(lenPad)).join('u'),
        rightPad = Array(Math.floor(lenPad)).join('u'),
        padded = leftPad + str + rightPad,
        buf = new Buffer(padded),
        addr = new Address(111, buf);
    return addr.toString()
}

function createHashTagOuts(hashtags) {
// returns regular pay to pubkey of addresses that function as hashtags
// these addresses look like uuuuuuuuuEuroMaidenuuuuuuuuu

    outs = [];
    hashtags.forEach(function (tag){
        txout = {
          address: hashtagStr(tag),
          amount: MIN_TX_OUT
        }
        outs.push(txout)
    });
    return outs
}

// Generates a single transaction that contains a msg
// callback is the function that gets called with the 
// signed transaction when this function returns
function singleTx(msg, hashtags, callback) {
    // provides funding utxos and keys to spend from
    conn.listunspent(function (err, ret){
        if (err) {
            throw("RPC woes: " + err);
        }
        var utxos = ret.result;

        var MAX_TX_SPEND = 0.001;

        // we should do inputs after outputs NOT before
        var inputTxs = [];
        var keys = [];
        var inputBTC = 0;
        for (var i = 0; i < utxos.length; i++) {
            if (inputBTC > MAX_TX_SPEND) {
                break;
            } 
            var utxo = utxos[i]; 
            inputBTC += utxo.amount;
            inputTxs.push(utxo); 
        }   

       var outs = createHashTagOuts(hashtags);
       outs = createAddressOuts(msg);
       // TODO does nothing
       // a tx builder obj 
       // we can set remainderOut
       console.log(outs)
       var tx = (new TransactionBuilder())
            .setUnspent(inputTxs)
            .setOutputs(outs)
            .build();

        
        var unsigned = tx.serialize().toString('hex')
        console.log(unsigned);
        conn.signRawTransaction(unsigned, function(err, ret) {
            if (err) {
                throw("Malformed TX to sign" + unsigned);
            }
            callback(ret.result)
        });


    });
}

var run = function() {
    var msg = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    console.log(hashtagStr("lies"))
    console.log(hashtagStr("laslalslsdlasd"))
    //console.log(hashtagStr("toooobig==============="))

    console.log(decodeAddr(hashtagStr("blahblah blah!")))

    singleTx(msg, [], function(signedTx){
    //console.log(signedTx)

    });
}

module.exports.run = run;
if (require.main === module) {
    run();
}
