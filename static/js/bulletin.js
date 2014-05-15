
function clearSelection(){
    if (window.getSelection) {
      if (window.getSelection().empty) {  // Chrome
        window.getSelection().empty();
      } else if (window.getSelection().removeAllRanges) {  // Firefox
        window.getSelection().removeAllRanges();
      }
    } else if (document.selection) {  // IE?
      document.selection.empty();
    }
}

$(document).ready(function(){

var Address = require('bitcore').Address;

var plusHandler = function(name) {
  return function() {
    var idSel = '#' + name + 's'
                                    // copy events
    var copy = $('#' + name + '-cc').clone(true);
    copy.css('display', 'block')
        .attr('id', '');
    if ($(idSel).children().length > 3) {
        return 0
    } else {
        $(idSel).append(copy);
        $(idSel + ' button.minus').removeAttr('disabled');
    }
  }
}

var minusHandler = function(name) {
  return function() {
    var idSel = '#' + name + 's'
    var formGroups = $(idSel).children()
    var len = formGroups.length;
    if (len > 1) {
        formGroups[formGroups.length - 1].remove()
    } else {
        var first = $(formGroups[0])
        first.find('input').val('');
        $(name + ' button.minus').attr('disabled', 'disabled');
    }
  }
}


$('#usertags button.plus').on('click', plusHandler('usertag'))
$('#hashtags button.plus').on('click', plusHandler('hashtag'))
$('#usertags button.minus').on('click', minusHandler('usertag'))
$('#hashtags button.minus').on('click', minusHandler('hashtag'))

$('.hashtag-bare').keyup(function() {
    try { 
        $(this).parent().removeClass('has-error') 
        var addrTag = addrNames.addressForStr($(this).val()); 
        $(this).parents('.form-group').find('.hashtag-rdy').val(addrTag);
    } catch (error) {
        $(this).parent().addClass('has-error');
    }
});

$('input.usertag').keyup(function() {
    $(this).parent().removeClass('has-error');
    addrStr = $(this).val(); 
    addr = new Address(addrStr);
    if (!(addr.isValid())){ 
        // addr is invalid
        $(this).parent().addClass('has-error');
    }
});

function proccessTags(raw_tags){
    tags = [];
    raw_tags.forEach(function(str){
        if (str.length > 30) {
            tags.push(str);
        }
    });
    return tags;
}

function buildTx() {
    // Storage method switch
    var method = $('#storage-method .active input').val()
    var cheap = (method === 'cheap');

    var network = $('#network .active input').val();

    var privKeyWIF = $('#privKey').val();
    var msg = $('#message').val();
    var hashtags = [];
    var usertags = [];
    $('#usertags input.usertag').each(function(i,inp){
                usertags.push($(inp).val())
    });
    $('#hashtags input.hashtag-rdy').each(function(i,inp){
                hashtags.push($(inp).val())
    });

    var hashtags = proccessTags(hashtags.concat(usertags));

    var txid = $('#txin-txid-1').val();
    var vout = Number($('#txin-index-1').val());
    var value = Number($('#txin-value-1').val());
    var txout = {txid: txid, 
                 vout: vout,
                 amount: value,
                 };

   
   console.log
   try {
        var hex = null;
        if (!(cheap)) { 
            hex = singleTx(msg, hashtags, txout, privKeyWIF, network);
        } else {
            hex = singleTxOP_RET(msg, hashtags, txout, privKeyWIF, network);
        }
        $('#raw-error').css('display', 'none');
        $('#raw-tx').css('display', 'block');
        $('#raw-bytes').val(hex);
   } catch (error) {
        $('#raw-tx').css('display', 'none');
        $('#raw-error').css('display', 'block');
        $('#raw-error .msg').text(error);
    }
   //*/
}

$("#build").on('click', function(){
    buildTx();
});


});
