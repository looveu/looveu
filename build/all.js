(function (window,document,Date,parseInt,parseFloat,Math,undefined) {
var Pkg=(function (G) {

/**
 * Pkg.js
 * @author CJ
 * @link http://jex.im/
 *
 * build之前的JS必须做的工作
 * 1.先加载Pkg.js及所有Lib的_nsconf_.js文件，再按依赖关系排序Pkg
 * 2.在define之前就prepareMeta，并且准备好assets,depPkgs
 * 3.如果优化define,则完成上述步骤后直接使用initit(pkgMeta)
 *
 */

function noop() {}

var Pkg={
    define:define,
    imports:imports,
    provide:provide,
    prepareMeta:prepareMeta,
    nsConfig:nsConfig,
    extend:extend,
    getLib:function (name) {
        return _libs[name];
    },
    getPkg:function (id) {
        return _pkgs[id];
    },
    getLoaderName:getLoaderName,
    ns:ns,
    initit:initit,
    _IE6:!G.XMLHttpRequest
},
/**
 * 所有已经加载的Library Dict
 * 以Library根命名空间为键的对象
 * 当exportMe都为true时，可视为_libs等同于window全局对象
 */
_libs={},
/**
 * 所有已经加载的pkg,以Pkg Id为键，以PkgObject为值
 * 作为快速查找Pkg的cache
 */
_pkgs={},
/**
 *    所有的(包括正在加载的)PkgMeta对象
 * 以id为键
 */
_pkgMetas={},
/**
 * 所有的nsconf,以LibName(根命名空间)为键，值为nsconf对象
 */
_nsconfs={},
/**
 * Pkg.fetchers
 * 获取资源文件的方法
 * fetchText需要单独实现，不内置
 */
_fetchers={
    type2fetcher:{
        css:'fetchCSS',
        json:'fetchJSON'
    },
    fetchCSS:function (cb,url,pid,libRoot,assetRelUrl) {
        var h=document.getElementsByTagName('head')[0],
            link=document.createElement('link');
        link.rel='stylesheet';
        link.type='text/css';
        link.href=url;
        link.charset='UTF-8';
        h.firstChild?h.insertBefore(link,h.firstChild):h.appendChild(link);
        cb();
    },
    fetchJSON:function (cb,url,pid,libRoot,assetRelUrl) {
        _fetchers.fetchText(function (json) {
            json=eval('('+json+')');
            cb(json);
        },url,pid,libRoot,assetRelUrl);
    }
},
/**
 *
 * Pkg.loaders
 * loader定义
 */
_loaders={
    archive:{
        loadAssetDeps:function (cb,pkgMeta) {
            var basePath=pkgMeta.path,assetDeps=pkgMeta.assetDeps,
                name,assets={},type,relUrl,
                libRoot=pkgMeta.nsconf.rootPath,
                fetcher,count=0,loaded=0;
            for (name in assetDeps) {
                if (assetDeps.hasOwnProperty(name)) {
                    relUrl=assetDeps[name].split(':');
                    if (relUrl.length===2) {
                        type=relUrl[0];
                        relUrl=relUrl[1];
                    } else {
                        relUrl=relUrl[0];
                        type=relUrl.split('.').pop();
                    }
                    fetcher=_fetchers[_fetchers.type2fetcher[type]];
                    if (!fetcher) {
                        throw 'Asset fetcher not found:'+type+',url:'+assetDeps[name];
                    }
                    count++;
                    //使用async,以让count计数完整，防止fetch同步返回，导入count没有统计完就与loaded比较
                    _async(fetch,[fetcher,name,basePath+relUrl,pkgMeta.pid,relUrl]);
                }
            }
            !count && cb(assets);
            function fetch(fetcher,name,url,pid,relUrl) {
                fetcher(function (result) {
                    if (name.charAt(0)!='_') {
                        assets[name]=result;
                    }
                    loaded++;
                    if (loaded==count) {
                        cb(assets);
                    }
                },url,pid,libRoot,relUrl);
            }

        }
    },
    wui:{
        getAssetDeps:function () {
            return {
                _style:'style.css',
                tpl:'tpl.html'
            };
        }
    },
    wui4ie6:{
		loadAssetDeps:function (cb,pkgMeta) {
            if (!Pkg._IE6) {
                return _loaders.archive.loadAssetDeps(cb,pkgMeta);
            }
			var ad=pkgMeta.assetDeps,p;
			ad.styleContent="str:"+ad._style.replace(/^css:/,"");
			_loaders.archive.loadAssetDeps(function (assets) {
				var css=assets.styleContent;
				delete ad.styleContent;
				delete assets.styleContent;
				if (css.indexOf("DXImageTransform.Microsoft.AlphaImageLoader") != -1) {
					p=pkgMeta.path+ad._style;
					p=p.split("/");
					p[p.length-1]="";
					p=p.join("/");
					fixIE6PngFilterSrc(css,p);
				}
				cb(assets);
			},pkgMeta);
		},
        getAssetDeps:function () {
            return {
                _style:Pkg._IE6?'ie6.css':'style.css',
                tpl:'tpl.html'
            };
        }
    }
},
/**
 * 备份的包含所有被覆盖的命名空间的旧的值
 * 只有使用ns方法覆盖的全局变量的才会备份。
 * {
 *         namespace:[oldValue1, oldValue2, lastValue]
 * }
 */
_nsbackup={},
/**
 * 等待队列
 * 队列中对象信息结构
 * {pid:[callback1,callback2....]}
 */
_waits=[],
_toString=Object.prototype.toString,
_slice=[].slice,
_objType='[object Object]',
_aryType='[object Array]';


Pkg.loaders=_loaders;
Pkg.fetchers=_fetchers;
Pkg._nsbackup=_nsbackup;
Pkg._waits=_waits;
Pkg._libs=_libs;
Pkg._pkgs=_pkgs;
Pkg._pkgMetas=_pkgMetas;
Pkg._nsconfs=_nsconfs;


//auto correct ie6 png filter AlphaImageLoader src relative URL to absolute URL.
function fixIE6PngFilterSrc(css,path) {
    var filterSrcRe=/([^{};]+)\{[^{}]+:\s*DXImageTransform\.Microsoft\.AlphaImageLoader\s*\((.*src\s*=\s*(?:'|")([^'"]+)(?:'|").*)\)/ig,
        groups=css.match(filterSrcRe),
        selector,params,src,
        sheets=document.styleSheets,
        lastSheet=sheets[sheets.length-1],
        l=groups.length,i=0,parts;
    for (;i < l;i++) {
        filterSrcRe.lastIndex=0;
        parts=filterSrcRe.exec(groups[i]);
        selector=parts[1];
        params=parts[2];
        src=parts[3];
        params=params.replace(src,path+src);
        lastSheet.addRule(selector,'filter:progid:DXImageTransform.Microsoft.AlphaImageLoader('+params+')');
    }
}



_loaders.wui.loadAssetDeps=_loaders.archive.loadAssetDeps;

//占位
_libs.Pkg=Pkg;
_pkgs.Pkg=Pkg;
_pkgMetas.Pkg={
    pid:'Pkg',
    body:arguments.callee
};
_pkgs['Pkg._nsconf_']=Pkg._nsconf_=_nsconfs.Pkg={
    rootPath:(typeof __dirname!=='undefined' && !G.document)?__dirname+'/../':_getLibRootPath('/Pkg/init.js')
};


//将Pkg导出成全局变量,之后可以用Pkg.ns('Pkg',false)来还原旧值
ns('Pkg',Pkg);

/**
 * ns 注册及获取命名空间
 * @name ns
 * @function
 * @param {String} names 命名空间.
 * @param {Object|Boolean} [target] 要注册的对象.或是undefined或Bool值true表示获取值，
 * false表达将这个值还原到旧值（即，注销命名空间）
 * @param {Object} [context=window] 上下文，默认为window全局对象.
 * @returns {Object} target.
 */
function ns(names, target, context) {
    var backup = !context, //提供context对象时不做备份
        cur = context || G, //默认的context为全局window对象
        pool = [],
        nsa = names.split('.'),
        n=nsa.pop(), i,
        args = arguments,
        al=args.length;


    while (i = nsa.shift()) {
        cur = cur[i] = cur[i] || {};
    }

    if (backup) {//需要备份，将使用_namespaces保存旧值
        pool = _nsbackup;
        pool = pool[names] = pool[names] || [];
    }

    if (al > 1 && !(target === true)) {//设置一个命名空间
        if (target === false) {//还原旧值
            cur[n] = pool.pop();
        } else {
            pool.push(cur[n]);
            cur[n] = target;
        }
    }
    return cur[n];
}

/**
 * define a Pkg
 * @param {String} pid Pkg Id,Pkg's full namespace.
 * @param {[]String} [deps] Pkg dependences,必须是数组类型
 * @param {Object} [assetDeps] Pkg asset dependences
 * @param {Function} [body] Pkg factory function
 */
function define(pid) {
    var argv=arguments,
        argc=argv.length,
        body=argv[argc-1],
        deps=_toString.call(argv[1])==_aryType?argv[1]:undefined,
        assetDeps=_toString.call(argv[argc-2])==_objType?argv[argc-2]:undefined,
        nsParts=pid.split('.'),
        rootNS=nsParts[0],
        pkgMeta=_pkgMetas[pid],
        pkg,k,
        assetsReady=true,depsReady=true,
        nsconf=_nsconfs[rootNS];

    if (nsParts[1]=='_nsconf_') { //_nsconf_.js，它是手动加载的，不会自动加载
        nsconf=body(); //_nsconf_的声明不能有任何依赖,没有deps参数，只有factory函数,且没有this
        nsConfig(rootNS,nsconf);
        return;
    }

    if (!pkgMeta) {//这个pkg.js是手动加载的
        pkgMeta=prepareMeta(pid);
    }

    pkgMeta.body=body;
    pkgMeta.deps.unshift.apply(pkgMeta.deps,deps || []);
    deps=pkgMeta.deps;

    //build之后的JS会在define之前准备好assets
    if (!pkgMeta.assets) {
        if (pkgMeta.assetDeps) {//nsconf里有预定义的assetDeps,所以在Pkg加载前就有了assetDeps
            if (assetDeps) {
                extend(pkgMeta.assetDeps || {},assetDeps);
            }
            assetDeps=pkgMeta.assetDeps;//写在Pkg中的assetDeps和useLoaders中loader的预先写到meta上的assetDeps
        }


        if (assetDeps) {
            assetsReady=false;
            pkgMeta.assetDeps=assetDeps;
            pkgMeta.loader.loadAssetDeps(function (assets) {
                    pkgMeta.assets=assets;
                    assetsReady=true;
                    initPkg();
            },pkgMeta);
        }
    }

    if (!pkgMeta.depPkgs && deps && deps.length) {//build之后depPkgs在define之前已经就绪,将depPkgs置为空数组或对应pkg，则不会去加载
        depsReady=false;
        imports(deps,function () {
            var args=_slice.call(arguments);
            /*
            if (pid!=rootNS) {
                //最后一个是rootNS,在depPkgs中去掉这个隐式参数
                args.pop();
            }*/
            pkgMeta.depPkgs=args;
            depsReady=true;
            initPkg();
        });
    }
    initPkg();

    function initPkg() {
        if (depsReady && assetsReady) {
            initPkg=noop;
            initit(pkgMeta);
        }
    }
}

function initit(pkgMeta) {
    var depPkgs=pkgMeta.depPkgs,deps=pkgMeta.deps,i;
    if (deps && (i=deps.length) && (!depPkgs || depPkgs.length!=i)) {
        //这是在build之后，让initit自动获取depsPkg
        depPkgs=[];
        while(i--) {
            depPkgs.unshift(_pkgs[deps[i]]);
        }
        pkgMeta.depPkgs=depPkgs;
    }
    var pkg=pkgMeta.body.apply(pkgMeta,depPkgs || []),
        pid=pkgMeta.pid;
    if (!pkg) {
        throw new Error("Invalid Pkg return:"+pid);
    }
    pkg._pkgMeta_=pkgMeta;
    if (pid.indexOf('.')<0) {//it is Root Pkg
        pkg._nsconf_=_nsconfs[pid];
    }
    pkgMeta.pkg=pkg;
    return provide(pid,pkg);

}

function nsConfig(rootNS,nsconf) {
    _nsconfs[rootNS]=nsconf;
    nsconf.libName=rootNS;
    if (!nsconf.rootPath) {//打包之后会加上这个path,就不会去检查
        nsconf.rootPath=_getLibRootPath('/'+rootNS+'/_nsconf_.js');
        if (!nsconf.rootPath) {//仍然查找不到rootPath,报错吧
            throw 'Pkg root path can not be resolved:'+rootNS;
        }
    }
    nsconf._loadersMap=nsconf.useLoaders && _getLoadersMap(nsconf);
}

/**
 * 向处提供一个Pkg,用于运行时动态创建Pkg,
 * 动态创建的Pkg没有PkgMeta,也没有nsconf及对根命名空间的依赖
 * 相当于ns方法，但ns方法注册的对象不能在imports及define的deps中使用
 * provide方法注册的Pkg可以被imports
 * @param {String} id Pkg id
 * @param {Object} pkg  Pkg object
 * @returns {Object} pkg
 */
function provide(id,pkg) {
    if (_pkgs.hasOwnProperty(id)) { //已经存在的Pkg
        throw new Error('Duplicate Pkg:'+id);
    }
    _pkgs[id]=pkg;
    if (id.indexOf(".")==-1 && !_libs.hasOwnProperty(id)) {
        _libs[id]=pkg;
    }
    ns(id,pkg);
    _resolvePkg(id,pkg);
    return pkg;
}

/**
 * 一个pkg加载完成，回call其它等待它完成的pkg
 */
function _resolvePkg(pid,pkg) {
    var fns,f;
    if (_waits.hasOwnProperty(pid)) {
        fns=_waits[pid];
        if (fns.length) {
            while (f=fns.pop()) {
                f(pkg);
            }
        }
    }
}


/**
 * 导入一系列Pkg后执行回调，并将pkg的引用按次序传递给回调函数作为参数
 * @param {[]String} pkgIds PkgId 数组
 * @param {Function} cb     callback.
 */
function imports(pkgIds,cb){
    var i=0,pkgs=[],count=pkgIds.length,loaded=0;
    if (!count) {
        return cb();
    }
    for (;i<count;i++) {
        (function (i,pid) {
            _waitPkg(pid,function (pkg) {
                pkgs[i]=pkg;
                loaded++;
                if (loaded==count) {
                    cb.apply(undefined,pkgs);
                }
            });
        })(i,pkgIds[i]);
    }
}

function _waitPkg(pid,cb) {
    if (_pkgs.hasOwnProperty(pid)) {
        cb(_pkgs[pid]);
    } else {
        if (!_waits.hasOwnProperty(pid)) {
            //第一次加载此pkg
            _waits[pid]=[];
            if (!_pkgMetas.hasOwnProperty(pid)) {
                //如果meta已经存在，则说明已经prepare 加载过了
                _loadScript(prepareMeta(pid).url);
            }
        }
        _waits[pid].push(cb);
    }
}

/**
 * 事先准备好它的PkgMeta信息
 */
function prepareMeta(pid) {
    var nsParts=pid.split('.'),
        rootNS=nsParts[0],deps=[],
        pkgName=nsParts[nsParts.length-1],
        nsconf=_nsconfs[rootNS],
        loaderName=getLoaderName(nsParts,nsconf._loadersMap),
        assetDeps,loader,
        pkgMeta,
        relUrl,url,
        relPath,path;
    if (nsParts.length==1) {//根命名空间
        relPath=rootNS+'/';
    } else if (loaderName!='base') {//配置非base loader的都使用目录形式的NS/path/PkgName/init.js
        relPath=nsParts.join('/')+'/';
    }
    if (!relPath) {//默认的NS/path/PkgName.js
        relPath=nsParts.slice(0,-1).join('/')+'/';
        relUrl=relPath+pkgName+'.js';
    } else {
        relUrl=relPath+'init.js';
    }

    if (_loaders.hasOwnProperty(loaderName)) {
        loader=_loaders[loaderName];
        assetDeps=loader.getAssetDeps && loader.getAssetDeps();
    } else if (nsconf.defineLoaders && nsconf.defineLoaders.hasOwnProperty(loaderName)) {
        loader=_loaders.archive;
        assetDeps=extend({},nsconf.defineLoaders[loaderName].assetDeps);
    }
    if (pid!=rootNS) {
        deps.push(rootNS);//添加对rootNS的依赖
    }

    pkgMeta={
        pid:pid,
        relUrl:relUrl,
        relPath:relPath,
        url:nsconf.rootPath+relUrl,
        path:nsconf.rootPath+relPath,
        assetDeps:assetDeps,
        nsconf:nsconf,
        loader:loader,
        deps:deps
    };
    _pkgMetas[pid]=pkgMeta;
    return pkgMeta;
}

function _loadScript(url) {
    var script=document.createElement('script'),
        head=document.getElementsByTagName('head')[0];
    script.type='text/javascript';
    script.charset='utf-8';
    script.async=true;
    script.src=url;
    head.firstChild?head.insertBefore(script,head.firstChild):head.appendChild(script);
}


function getLoaderName(nsParts,loadersMap) {
    var i=nsParts.length,p,
        loaderName;
    if (loadersMap ) {
        for(;i;i--) {
            p=nsParts.slice(0,i).join('.');
            if (loadersMap.hasOwnProperty(p) && (loaderName=loadersMap[p])) {
                break;
            }
        }
    }
    if (!loaderName) {//没有在useLoaders中配置的,默认使用base loader
        loaderName='base';
        if (nsParts.length===1) { //根命名使用archive
            loaderName='archive';
        }
    } else {
        loadersMap[p]=loaderName;
    }
    return loaderName;
}



function extend(o,from) {
    for (var k in from) {
        if (from.hasOwnProperty(k)) {
            o[k]=from[k];
        }
    }
    return o;
}



//在浏览器环境中获取_nsconf_.js对应的URL，唉，存在获取错误的可能性啊
function _getLibRootPath(ends) {
    var scripts=document.getElementsByTagName('script'),
        i=scripts.length,
        si,
        src;
    while (i--) {
        src=scripts[i].src;
		if (src.indexOf(":")==-1) {//IE6下不能直接通过src获得绝对URL
			src=scripts[i].getAttribute("src",4);
		}
        if (src) {
            src=src.split('#')[0].split('?')[0];
            si=src.indexOf(ends);
            if (si != -1 && si==src.length-ends.length) {//测试以/NS/_nsconf_.js结尾
                return src.replace(ends,'')+'/';
            }
        }
    }
}


/**
 * 建立一个以Namespace为键的loaders映射,Namespace包含RootNS
 * {
 *         "Root.ui":"wui",
 *         "Root.data":"archive",
 *         "Root":"archive"
 * }
 */
function _getLoadersMap(nsconf) {
    var useLoaders=nsconf.useLoaders,
        defineLoaders=nsconf.defineLoaders,
        loadersMap={},pid,
        k,useLoaderPkgs,i,rpid;
    if (defineLoaders) {
        for (loaderName in defineLoaders) {
            if (_loaders.hasOwnProperty(loaderName) && defineLoaders.hasOwnProperty(loaderName)) {
                throw 'Loader `'+loaderName+'` duplicate in lib ['+nsconf.libName+']';
            }
        }
    } else {
        defineLoaders={};
    }
    for (loaderName in useLoaders) {
        if (useLoaders.hasOwnProperty(loaderName)) {
            if (!(_loaders.hasOwnProperty(loaderName) || defineLoaders.hasOwnProperty(loaderName))) {
                throw 'Loader `'+loaderName+'` used in ['+nsconf.libName+'] lib is undefined!';
            }
            useLoaderPkgs=useLoaders[loaderName];
            i=useLoaderPkgs.length;
            while (i--) {
                rpid=useLoaderPkgs[i];//不包含RootNS的Namespace
                pid=rpid?(nsconf.libName+'.'+rpid):nsconf.libName; //这里留个后路，支持空字符串，loader作用于整个lib
                if (loadersMap.hasOwnProperty(pid)) {
                    throw 'Pkg ['+pid +
                        '] use more than one loader:'+ loaderName+','+loadersMap[pid];
                }
                loadersMap[pid]=loaderName;
            }
        }
    }
    return loadersMap;
}

function _async(f,args) {
    setTimeout(function () {
            f.apply(undefined,args);
            f=undefined;
    },0);
}



return Pkg;

})(this);
var pm,nsConfig=Pkg.nsConfig,initit=Pkg.initit,prepareMeta=Pkg.prepareMeta,extend=Pkg.extend;
nsConfig("Looveu",{"useLoaders":{"wui4ie6":["ui"],"archive":["Window"]},"rootPath":"http://s.jamcode.org/js/","libName":"Looveu"});
pm=prepareMeta("Looveu");
pm.deps=[];
pm.body=function () {
	var Looveu={
		Looveu:function () {
			alert('Looveu')
		}
	};
	
	return Looveu;
};
initit(pm);
var Looveu=pm.pkg;
pm=prepareMeta("Looveu.util.String");
pm.deps=["Looveu"];
pm.body=function () {
		return 'String mod';
};
initit(pm);
pm=prepareMeta("Looveu.Window");
pm.deps=["Looveu.ui.Button","Looveu.util.String","Looveu"];
pm.assetDeps={"html":"window.html","db":"db.json","_style":"css/style.css"};
pm.assets={"html":"<div style=\"width:200px;height:200px;border:3px ridge lime;background:green\">Window!</div>","db":{"name":"WindowDB","file":"Looveu/Window/db.json"}};
pm.body=function () {
	var html=this.assets.html;
	var div=document.createElement('DIV');
    console.log(this.assets.db);
	div.innerHTML=html;
		document.body.appendChild(div);
	return {name:'Window'};
};
initit(pm);
pm=prepareMeta("Looveu.query");
pm.deps=["Looveu.util.String","Looveu"];
pm.body=function () {
	function query(id) {
		return document.getElementById(id);
	}

	return query;
};
initit(pm);
pm=prepareMeta("Looveu.util.md5");
pm.deps=["Looveu.util.String","Looveu"];
pm.body=function () {
		return 'md5 mod';
};
initit(pm);
pm=prepareMeta("Looveu.util.Cookie");
pm.deps=["Looveu.util.md5","Looveu"];
pm.body=function () {
		return "Cookie Mod";
};
initit(pm);
pm=prepareMeta("Looveu.dom.Style");
pm.deps=["Looveu.query","Looveu"];
pm.body=function (query) {
	return {name:'style',query:query};
};
initit(pm);
pm=prepareMeta("Looveu.dom.Node");
pm.deps=["Looveu.dom.Style","Looveu.query","Looveu"];
pm.body=function (Style,query) {
	return {name:'Node',style:Style,query:query};
};
initit(pm);
pm=prepareMeta("Looveu.$");
pm.deps=["Looveu.dom.Style","Looveu.dom.Node","Looveu"];
pm.body=function (Style,Node) {
	return {name:'$',style:Style,Node:Node}
};
initit(pm);
})(window,document,Date,parseInt,parseFloat,Math);