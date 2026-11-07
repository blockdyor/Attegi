const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').resolve(__dirname,'../../src/js/libs/highlight.pack.js'),'utf8');
const c=vm.createContext({console});new vm.Script(source).runInContext(c);const a=c.hljs;
a.highlight('func f(label local: Int) {}',{language:'swift'});
const s=a.getLanguage('swift'),tuple=s.contains.at(-1),params=s.contains[2].contains.find(m=>m.end?.source==='\\)');
const failures=[];
for(const [id,parent,target]of [['22',tuple,tuple.contains[1]],['23',params,params.contains[0]],['24',params,params.contains[0]]]){
 const re=parent.matcher.getMatcher(0).matcherRe;
 if(re.source.includes(target.beginRe.source))failures.push(id);
 assert.equal(new RegExp(target.beginRe.source).exec(id==='22'?'label :':'label local:')[0],id==='22'?'label :':'');
}
assert.deepEqual(failures,[],'expensive Swift begins remain in selecting matcher');
console.log('Swift 22/23/24 compiled selection PASS');
