// Public callback-flow oracle, executable under both Node and Bun without git history.
const assert = require('node:assert/strict');
const { source, base, original, load, hash } = require('./highlight-metadata-oracle.cjs');
const plain = value => JSON.parse(JSON.stringify(value));
function snapshot(r) {
    const top = [];
    for (let m = r._top; m; m = m.parent) top.push({scope:m.scope, skip:m.skip, excludeEnd:m.excludeEnd, returnEnd:m.returnEnd, data:m.data});
    return plain({value:r.value, relevance:r.relevance, illegal:r.illegal, language:r.language,
        ir:r._emitter.rootNode, top, error:r.errorRaised?.message,
        illegalBy:r._illegalBy && {index:r._illegalBy.index, context:r._illegalBy.context, message:r._illegalBy.message}});
}
function witness(text, {unicodeRegex=false, debug=false, throwSecond=false, order=[]} = {}) {
    const api = load(text), events = []; let calls = 0, data;
    api.registerLanguage('p', h => ({unicodeRegex, contains:[
        {begin:/a/, 'on:begin':(m,r) => {events.push(['a',m[0],m.index]);r.ignoreMatch();}},
        h.COMMENT('~', /END$/).contains[1],
        {begin:/x/, 'on:begin':(m,r) => {
            assert.equal(m.rule, api.getLanguage('p').contains[2]);
            assert.equal(r.data, m.rule.data);
            if (data) assert.equal(r.data, data); else data = r.data;
            r.data.calls = (r.data.calls || 0) + 1;
            events.push(['x',m[0],m[1],m.index,m.input,m.type]);
            if (++calls === 2 && throwSecond) throw Error('second ordinary callback');
            r.ignoreMatch();
        }}
    ]}));
    if (debug) api.debugMode();
    api.highlight('', {language:'p'});
    const matcher = api.getLanguage('p').matcher;
    for (const offset of order) matcher.getMatcher(offset);
    return { api, matcher, run(code) {
        calls = 0; events.length = 0;
        let r, thrown;
        try { r = api.highlight(code, {language:'p', ignoreIllegals:false}); } catch (e) { thrown = e.message; }
        return {calls, events:plain(events), result:r && snapshot(r), thrown, data:plain(data || {})};
    }};
}
const groups = {
    'original single callback and base duplicate, including safe/debug errors'() {
        let rows = 0;
        for (const unicodeRegex of [false,true]) for (const debug of [false,true]) for (const throwSecond of [false,true]) {
            const options = {unicodeRegex,debug,throwSecond};
            const expected = witness(original,options).run('a x');
            assert.equal(expected.calls,1); assert.equal(expected.thrown,undefined); assert.equal(expected.result.error,undefined);
            const broken = witness(base,options).run('a x');
            assert.equal(broken.calls,2);
            if (throwSecond) assert.equal(debug ? broken.thrown : broken.result.error, 'second ordinary callback');
            assert.deepEqual(witness(source,options).run('a x'),expected);
            rows++;
        }
        return rows;
    },
    'cache construction order and reused fresh buffers preserve callback/data identity'() {
        let rows = 0;
        for (const unicodeRegex of [false,true]) for (const debug of [false,true]) for (const order of [[],[0,1,2],[2,1,0],[1,2,0]]) {
            const candidate = witness(source,{unicodeRegex,debug,order});
            // Fresh original calls define the flow; its reused cache has the same latent ownership bug.
            const repairedOriginal = witness(original.replace('n.position=this.position++,',
                'n=Object.assign({},n,{position:this.position++}),'),{unicodeRegex,debug});
            let total = 0;
            for (const code of [' x','a x',' x','a x','']) {
                const expected = witness(original,{unicodeRegex,debug}).run(code);
                total += expected.calls;
                expected.data = total ? {calls:total} : {};
                const actual = candidate.run((' '+code).slice(1));
                assert.deepEqual(actual,expected);
                assert.deepEqual(actual,repairedOriginal.run(code)); rows++;
            }
            const stale = witness(original,{unicodeRegex,debug});
            assert.equal(stale.run('a x').calls,1);
            assert.equal(stale.run(' x').calls,2);
            const full = candidate.matcher.getMatcher(0), suffix = candidate.matcher.getMatcher(1);
            const fullX = Object.values(full.matchIndexes).find(x=>x.rule===candidate.api.getLanguage('p').contains[2]);
            const suffixX = Object.values(suffix.matchIndexes).find(x=>x.rule===fullX.rule);
            assert.notEqual(fullX,suffixX);
            assert.equal(fullX.rule,suffixX.rule);
            assert.equal(fullX.rule.data,suffixX.rule.data);
        }
        return rows;
    },
    'ordinary sibling/end/illegal/EOF/zero-width callbacks equal original'() {
        const cases = [
            ['xy;z xy;', () => ({contains:[{begin:/xy/,'on:begin':(m,r)=>r.ignoreMatch()}, {scope:'title',begin:/(x)(y)/,end:/(;)(z)?/}]})],
            ['[! tail', () => ({contains:[{scope:'string',begin:/\[/,end:/(!)/,contains:[{begin:/z/,'on:begin':(m,r)=>r.ignoreMatch()}]}]})],
            ['! tail', () => ({illegal:/(!)/,contains:[{begin:/z/,'on:begin':(m,r)=>r.ignoreMatch()}]})],
            ['', () => ({contains:[{begin:/$/,'on:begin':(m,r)=>r.ignoreMatch()}]})],
            ['[', () => ({contains:[{begin:/\[/,end:/$/}]})],
            ['a😀z', () => ({contains:[{begin:/a/,'on:begin':(m,r)=>r.ignoreMatch()},{scope:'title',begin:/(😀)(z)/}]})],
            ['~x!42~y!42', () => ({contains:[{scope:'string',begin:/~/,end:/!/,excludeEnd:true},{match:/42/,scope:'number'}]})]
        ];
        let rows = 0;
        for (const unicodeRegex of [false,true]) for (const debug of [false,true]) for (const ignoreIllegals of [false,true]) for (const [code,make] of cases) {
            const results = [source,original].map(text => {
                const api=load(text), events=[];
                api.registerLanguage('p',()=>{const grammar=make();grammar.unicodeRegex=unicodeRegex;
                    function visit(m) { for(const key of ['on:begin','on:end']) {
                        const old=m[key]; m[key]=(match,r)=>{
                            events.push([key,match[0],match.index,match.input,match.type,Array.from(match).slice(1)]);
                            r.data.count=(r.data.count||0)+1;
                            if(old)old(match,r);
                        };
                    } for(const child of m.contains||[])visit(child); }
                    for(const m of grammar.contains||[])visit(m); return grammar;
                });
                if(debug)api.debugMode();
                const result={result:snapshot(api.highlight(code,{language:'p',ignoreIllegals})),events:plain(events)};
                return result;
            });
            if(code==='') {
                // Existing rejected-EOF correction: the original emitted a literal undefined.
                assert.equal(results[0].result.value,'');
                assert.equal(results[1].result.value,'undefined');
                assert.deepEqual(results[0].events,results[1].events);
                const api=load(base);api.registerLanguage('p',()=>({...make(),unicodeRegex}));if(debug)api.debugMode();
                assert.deepEqual(results[0].result,snapshot(api.highlight(code,{language:'p',ignoreIllegals})));
            } else assert.deepEqual(results[0],results[1],code);
            rows++;
        }
        return rows;
    },
    'lexical mutations, continuation and bounded callback/emitter reentry equal original'() {
        let rows=0;
        for(const kind of ['ignore-end','lexeme','index','callback-reentry','emitter-reentry','sublanguage']) for(const debug of [false,true]) {
            const results=[source,original].map(text=>{
                const api=load(text), events=[];let nested=false;
                api.registerLanguage('p',()=>({contains:[{scope:'string',begin:/~/,end:/!/,excludeEnd:true,
                    'on:end':(m,r)=>{events.push([m[0],m.index,r.data.count||0]);r.data.count=(r.data.count||0)+1;
                        if(kind==='ignore-end'&&m.index===6){events.push(['ignored-end',m.index]);r.ignoreMatch();}
                        if(kind==='lexeme')m[0]='OTHER';
                        if(kind==='index')m.index+=1;
                        if(kind==='callback-reentry'&&!nested){nested=true;events.push(['reentry']);api.highlight('~nested!',{language:'p'});nested=false;}
                    }},{match:/42/,scope:'number'}]}));
                if(debug)api.debugMode();
                const E=api.highlight('',{language:'p'})._emitter.constructor;
                class Recording extends E {addText(t){if(t)events.push(['text',t]);
                    if(kind==='emitter-reentry'&&!nested&&t.includes('outer')){nested=true;events.push(['reentry']);api.highlight('~nested!',{language:'p'});nested=false;}
                    return super.addText(t);
                }}
                api.configure({__emitter:Recording});
                api.registerLanguage('host',()=>({contains:[{begin:/</,end:/>/,excludeBegin:true,excludeEnd:true,subLanguage:'p'}]}));
                const codes=kind==='sublanguage'?['<~outer><tail!42>','<~other!42>']:['~outer!42~other!42','~outer!!42'];
                const results=codes.map(code=>snapshot(api.highlight(code,{language:kind==='sublanguage'?'host':'p',ignoreIllegals:false})));
                if(kind==='ignore-end')assert(events.some(e=>e[0]==='ignored-end'));
                if(kind.endsWith('reentry'))assert(events.some(e=>e[0]==='reentry'));
                return {results,events};
            });
            assert.deepEqual(results[0],results[1],kind);rows++;
        }
        return rows;
    },
    'default all 36 languages, 71 aliases, raw IR/chunks and top-two ranking equal original'() {
        const candidate=load(), oracle=load(original);let rows=0;
        assert.equal(candidate.listLanguages().length,36);
        assert.deepEqual(Array.from(candidate.listLanguages()),Array.from(oracle.listLanguages()));
        assert.deepEqual(Object.keys(candidate).sort((a,b)=>a<b?-1:a>b?1:0),Object.keys(oracle).sort((a,b)=>a<b?-1:a>b?1:0));
        function record(api,code,language,ignoreIllegals){
            const E=api.highlight('',{language})._emitter.constructor,chunks=[];
            class Recording extends E {addText(t){if(t)chunks.push(t);return super.addText(t);}}
            api.configure({__emitter:Recording});
            try{return {result:snapshot(api.highlight(code,{language,ignoreIllegals})),chunks};}
            finally{api.configure({__emitter:E});}
        }
        const aliases=[];
        for(const debug of [false,true]) {
            if(debug){candidate.debugMode();oracle.debugMode();}
            for(const language of oracle.listLanguages()) {
                assert.deepEqual(plain(candidate.getLanguage(language).aliases||[]),plain(oracle.getLanguage(language).aliases||[]));
                if(!debug)aliases.push(...oracle.getLanguage(language).aliases||[]);
                for(const code of ['', 'warmup 42', 'foo = "bar";\n', '/* one two three */\n', '< & >\n', 'sub f :a(x); print 42;']) for(const ignore of [false,true]) {
                    const actual=record(candidate,code,language,ignore), expected=record(oracle,code,language,ignore);
                    if(language==='scss'&&code==='foo = "bar";\n'&&!ignore) {
                        // Prior fallback-offset correction; ownership must not alter this private metadata.
                        assert.deepEqual(expected.result.illegalBy,{index:0,context:code,message:'Illegal lexeme "=" for mode "<unnamed>"'});
                        expected.result.illegalBy.index=3;
                        assert.deepEqual(actual,record(load(base),code,language,ignore));
                    }
                    assert.deepEqual(actual,expected,language+':'+code);rows++;
                }
            }
            for(const alias of aliases){assert.deepEqual(record(candidate,'warmup 42',alias,false),record(oracle,'warmup 42',alias,false),alias);rows++;}
            for(const code of ['class Foo extends Bar { run(x) { return x; } }','interface User { name: string }','function f(a=(1+2)) { return a; }']) {
                const auto=api=>{const r=api.highlightAuto(code);return {first:snapshot(r),second:r.secondBest&&snapshot(r.secondBest)};};
                assert.deepEqual(auto(candidate),auto(oracle)); rows++;
            }
        }
        assert.equal(aliases.length,71);return rows;
    }
};
module.exports={groups,snapshot,witness};
if(require.main===module){const rows=Object.fromEntries(Object.entries(groups).map(([name,run])=>[name,run()]));console.log(JSON.stringify({runtime:process.versions,source:hash(source),rows},null,2));}
