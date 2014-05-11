var bitcore = require('bitcore');
var networks = bitcore.networks;
var Script = bitcore.Script;
var Address = bitcore.Address;
var base58 = bitcore.base58
var COIN = bitcore.util.COIN;
var TransactionBuilder = bitcore.TransactionBuilder;
var TransactionOut = bitcore.Transaction.Out;
var Buffer = bitcore.Buffer;
var Key = bitcore.Key;
var Script = bitcore.Script;
var buffertools = bitcore.buffertools;

var MAX_OP_RETURN_RELAY = 40;
var MIN_TX_OUT = 0.00000546;


/*
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
}*/


/*
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
*/


function encodeAddr(input_bin){
    if (input_bin.length > 20) {
        throw("input must be less than 20 bytes long");
    } 

    empt = String.fromCharCode(95)
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

function decodeAddressOuts(outs){
    // takes a list of txouts from a transaction returned by insight
    var msg = "";

    outs.forEach(function (out) {
        var addr = out.scriptPubKey.addresses[0]
        var chunk = decodeAddr(addr)
        msg += chunk;
    });
    return msg
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
function singleTx(msg, hashtags, inputTx, pkWIF) {
    // msg is a string
    // hashtag is a string
    // inputTx = {txout: <hash>, vout: <index>, amount: <BTC>}
    // pkWIF is a base58 private Key

    var privK = new Key();
                    // Since bitcoin reports the keys in a WIF format we must chop
    privK.private = base58.decode(pkWIF).slice(1,33);
    privK = privK.regenerateSync();
    
    var addr = Address.fromPubKey(privK.public, 'testnet');
    hash = bitcore.util.sha256ripe160(privK.public);

    // filling out {confirmations, address, scriptPubkey} in txin obj
    inputTx.confirmations = 9001;
    inputTx.address = addr.toString();

    spk1 = "76a9149bca862160c35461c6f8496ad270b109b8d2525988ac";

    humane = 'DUP HASH160 0x14 0x' + hash.toString('hex') + ' EQUALVERIFY CHECKSIG'
    conv = Script.fromHumanReadable(humane)
    spk2 = conv.serialize().toString('hex')
    spk3 = Script.createPubKeyHashOut(hash).serialize().toString('hex');
    
    console.log(spk1);
    console.log(spk2);
    console.log(spk3);
    
    inputTx.scriptPubKey = spk2

    
    var outs = createHashTagOuts(hashtags);
    outs = createAddressOuts(msg);
    
    // a tx builder obj 
    var builder = (new TransactionBuilder())
            .setUnspent([inputTx])
            .setOutputs(outs)
            .sign([pkWIF])
    
    if (!(builder.isFullySigned())) {
        debugger;
        throw('Bad Signature')
    }


    var tx = builder.build();


    // tx is now signed and ready to roll 
    var hex = tx.serialize().toString('hex')
    return hex
}
