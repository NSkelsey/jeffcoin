var bitcore = require('bitcore');
var networks = bitcore.networks;
var Script = bitcore.Script;
var Address = bitcore.Address;
var base58 = bitcore.base58;
var COIN = bitcore.util.COIN;
var TransactionBuilder = bitcore.TransactionBuilder;
var TransactionOut = bitcore.Transaction.Out;
var Buffer = bitcore.Buffer;
var Key = bitcore.Key;
var Script = bitcore.Script;
var buffertools = bitcore.buffertools;
var Opcode = bitcore.Opcode;

var MAX_OP_RETURN_RELAY = 40;
var MIN_TX_OUT = 0.00000546;
var NETNAME = "mainnet";



// chunk is a utf string
function createOP_RETURN(chunk){
    // as defined by our friends at https://github.com/bitcoin/bitcoin/blob/ae7e5d7cebd9466d0c095233c9273e72e88fede1/src/script.h#L212
    var OP_RET = Opcode.map['OP_RETURN']; 
    var script = new Script();

    script.writeOp(OP_RET);
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

    if (raw.length > 400) {
        throw "This is twitter not some blog service";
    } 

    // round up. Note we do not have to pad since OP_RET can push 40 or lower
    var numOuts = 1 //Math.ceil(raw.length / MAX_OP_RETURN_RELAY);
    var outs = [];

    for (var i = 0; i < numOuts; i++){
    
        var msgWidth = 500,//MAX_OP_RETURN_RELAY,
            slice = raw.slice(0, msgWidth),
            script = createOP_RETURN(slice);
            raw = raw.slice(msgWidth);

        var txOut = new TransactionOut();
        // out has v <out satoshis>  = 0 and s <script> set to buf of len 42
        txOut.v = new Buffer(8);
        txOut.s = script.serialize();
        outs.push(txOut);
    }
    return outs;
}



function encodeAddr(input_bin){
    if (input_bin.length > 20) {
        throw("input must be less than 20 bytes long");
    } 

    empt = String.fromCharCode(95);
    pad = Array(20 - input_bin.length + 1).join(empt);
    bin = new Buffer(input_bin + new Buffer(pad));

                // testnet address version
    var ver = networks.testnet.addressVersion;
    var addr = new Address(ver, bin);
    return addr.toString();
}

function decodeAddr(address){
    var raw = base58.decode(address); 
    data = raw.slice(1, 21);
    
    str = data.toString('utf-8');

    return str;
}

function decodeAddressOuts(outs){
    // takes a list of txouts from a transaction returned by insight
    var msg = "";

    outs.forEach(function (out) {
        var addr = out.scriptPubKey.addresses[0];
        var chunk = decodeAddr(addr);
        msg += chunk;
    });
    return msg;
}
 
function createAddressOuts(msg) {
// finds DER encodings of public keys that are actually utf character encodings
    var buf = new Buffer(msg);    
    if (buf.length > 140) {
        throw("This is twitter damnit");
    }
    var numNeeded = Math.ceil(buf.length / 20);
    var outs = [];

    for (var i = 0; i < numNeeded; i++){
        var slice = buf.slice(0, 20);
        buf = buf.slice(20);
        
        var addr = encodeAddr(slice);
        txout = {
            address: addr,
            amount: MIN_TX_OUT
        };
        outs.push(txout);
    }
    return outs;
}

function hashtagStr(str) {
// centers and pads a hashtag
    if (str.length > 20) {
       throw("provided address must be maximum 20 bytes");
    }
    var lenPad = (20 - str.length)/2 + 1,
        leftPad = Array(Math.ceil(lenPad)).join('u'),
        rightPad = Array(Math.floor(lenPad)).join('u'),
        padded = leftPad + str + rightPad,
        buf = new Buffer(padded),
        addr = new Address(111, buf);
    return addr.toString();
}

function createHashTagOuts(hashtags) {
// returns regular pay to pubkey of addresses that function as hashtags

    outs = [];
    hashtags.forEach(function (tag){
        txout = {
          address: tag,
          amount: MIN_TX_OUT
        };
        outs.push(txout);
    });
    return outs;
}

// Takes a private key in WIF format and returns
// a public key in binary
function privToPub(privWIF) {
    if (52 > privWIF.length || privWIF.length > 53) {
        throw("The private key provided is not in the right format");
    }
    var key = new Key();
    // Since bitcoin reports the keys in a WIF format we must chop
    var privBin = base58.decode(privWIF).slice(1,33);
    key.private = privBin;
    key.regenerateSync();
    
    return key.public;
}

function formulateInput(inputMap, pubKey, network) {
    // converts an input of {txoud: <hash>, vout: <pos>, amount: <BTC>}
    // into a valid input tx of form:
    // {txout: <hash>, vout: <pos>, amount: <BTC>,
    //  confirmations: <num>, address: <base58>,
    //  scriptPubKey: <hex>}

    var addr = Address.fromPubKey(pubKey);
    if (network === 'testnet') { 
        addr = Address.fromPubKey(pubKey, network);
    }
    var hash = bitcore.util.sha256ripe160(pubKey);
    var pubKey = Script.createPubKeyHashOut(hash).serialize().toString('hex');

    // filling out {confirmations, address, scriptPubkey} in txin obj
    inputMap.confirmations = 9001;
    inputMap.address = addr.toString();
    inputMap.scriptPubKey = pubKey;

    return inputMap;
}



function singleTxOP_RET(msg, hashtags, inputTx, pkWIF, network) {
    var pubKey = privToPub(pkWIF);
    inputTx = formulateInput(inputTx, pubKey, network);
    
    var outs = createHashTagOuts(hashtags);
    var msg_outs = createCheapOuts('-- ahmisa-0.0.0 -- ' + msg);
    
    var builder = (new TransactionBuilder())
            .setUnspent([inputTx])
            .setOutputs(outs); 
    
    // add our custom formulated OP_RETs to the TX    
    msg_outs.forEach(function(out) { 
        builder.tx.outs.push(out); 
    });

    // now sign and build    
    builder.sign([pkWIF]);
    var tx = builder.build();
    var hex = tx.serialize().toString('hex');
    return hex;
}



// Generates a single transaction that contains a msg
// callback is the function that gets called with the 
// signed transaction when this function returns
function singleTx(msg, hashtags, inputObj, pkWIF, network) {
    // msg is a string
    // hashtag is a string
    // inputTx = {txout: <hash>, vout: <index>, amount: <BTC>}
    // pkWIF is a base58 private Key
    // A string of either 'testnet' or 'mainnet'
    var pubKey = privToPub(pkWIF);
    var inputTx = formulateInput(inputObj, pubKey, network);
        
    var h_outs = createHashTagOuts(hashtags);
    var outs = createAddressOuts(msg);
    outs = outs.concat(h_outs);
    
    var builder = (new TransactionBuilder())
            .setUnspent([inputTx])
            .setOutputs(outs)
            .sign([pkWIF]);
    
    if (!(builder.isFullySigned())) {
        debugger;
        throw('Bad Signature, the transaction remains unsigned');
    }
    var tx = builder.build();
    // tx is now signed and ready to roll 
    var hex = tx.serialize().toString('hex');
    return hex;
}
