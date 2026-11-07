// Partial successful escaped-quote prefix challenges greedy native recovery and real continuation.
function input(family,n){
 if(family==='quoted-success')return '"head\\"=1 '+('a\\"').repeat(n)+'tail';
 const rich=('"a\\"b" . \'c\' . ').repeat(n);
 if(family==='dotted-success')return rich+'"z" =1';
 if(family==='rich-negative')return rich+'z = #';
 throw Error('unknown INI native family: '+family);
}
module.exports={input,families:['quoted-success','dotted-success','rich-negative']};
