/**
 * @author CJ
 * @link http://jex.im/
 */
Pkg.define('Pkg.fetchers.fetchText',function () {

    //部署到生产环境时需要删除_xproxy_.html文件
	function fetchText(cb,url,pid,libRoot,assetRelUrl) {
		_xhrGet(url,cb,function () {
			_iframeGet(url,cb,pid,libRoot,assetRelUrl);
		});
	}

	function _xhrGet(url,cb,fail) {
		var xhr=window.XMLHttpRequest?new XMLHttpRequest:new ActiveXObject('Microsoft.XMLHTTP');
		try {
			xhr.open('GET',url);
			xhr.setRequestHeader('X-Requested-With','XMLHttpRequest');
			xhr.onreadystatechange=function () {
				if (xhr.readyState===4) {
					xhr.onreadystatechange=Number;//相当于noop
					var headers=xhr.getAllResponseHeaders(),
						result=xhr.responseText;
					xhr.abort();
					if (!headers.length) {//Chrome,Opera,Firefox跨域請求没有返回header
						fail();
						return;
					}
					cb(result);
				}
			};
			xhr.send();
		} catch (e) {//IE,Opera抛出error,Opera是个2
			xhr.onreadystatechange=Number;
			fail();
		}
	}

	var _iframeGet=window.postMessage?_iframeGetMsg:_iframeGetName,
		_msgProxyIframe,
        _onIframeLoad=[],
        _msgCallbacks={},
        _SEP='\r\n===\r\n'+(+new Date)+'\r\n===\r\n';//序列化分隔符
	function _createIframe() {
		var iframe=document.createElement('iframe');
		iframe.style.display='none';
		iframe.style.visibility='hidden';
		iframe.src='about:blank';
		document.body.appendChild(iframe);
		return iframe;
	}



    /**
     *
     * 使用postMessage跨域传输
     */
	function _iframeGetMsg(url,cb,pid,libRoot,assetRelUrl) {

		if (!_msgProxyIframe) {
			_msgProxyIframe=_createIframe();
			_msgProxyIframe.onload=function () {
                if (_msgProxyIframe.detachEvent) {
                    _msgProxyIframe.detachEvent('onload',_msgProxyIframe.onload);
                }
                _msgProxyIframe.onload=null;
                var fns=_onIframeLoad,f;
                _onIframeLoad=null;
                while (f=fns.pop()) {
                    f();
                }
			};

            if (window.addEventListener) {
                window.addEventListener('message',_onMsg);
            } else {
                window.attachEvent('onmessage',_onMsg);
                _msgProxyIframe.attachEvent('onload',_msgProxyIframe.onload);
            }
			_msgProxyIframe.src=libRoot+pid.split('.').shift()+'/_xproxy_.html#'+encodeURIComponent(_SEP);

		}
        if (_onIframeLoad) {
            _onIframeLoad.push(function () {
                _iframeGetMsg(url,cb,pid,libRoot,assetRelUrl);
            });
            return;
        }

        var w=_msgProxyIframe.contentWindow,
            cid='CB'+(+new Date)+Math.random(),
            msg=[cid,pid,assetRelUrl].join(_SEP);
        _msgCallbacks[cid]=[pid,cb];

        w.postMessage(msg,'*');

	}

    function _onMsg(evt) {
        evt = evt || window.event;
        var msgs=evt.data.split(_SEP),
            cid=msgs[0],
            pid=msgs[1],
            result=msgs[2],
            file=msgs[3],
            cba=_msgCallbacks[cid];

        if (!cba ||  cba[0]!=pid) {
            return;
        }

        _msgCallbacks[cid]=null;
        cba[1](result);
    }

	function _iframeGetName(url,cb,pid,libRoot,assetRelUrl) {
		var iframe=_createIframe(),redir,
            secondLoad=0;
			src=libRoot+pid.split('.').shift()+'/_xproxy_.html';
        redir=location.href.slice(0,location.href.split('?')[0].indexOf('/',10)+1);
        redir+='404.html';

        src+='?'+encodeURIComponent([pid,assetRelUrl,redir].join(_SEP));
        src+='#'+encodeURIComponent(_SEP);
        iframe.onload=function () {
            //console.log('iframe for:',pid,',',assetRelUrl,',',secondLoad);
            if (!secondLoad) {
                secondLoad++;
                return;
            }
            var ret;
            try {
                ret=iframe.contentWindow.name;
            } catch(e) {
                return;
            }

            if (ret) {
                ret=ret.split(_SEP);
                if (ret[0]==pid) {
                    cb(ret[1]);
				}
                if (iframe.detachEvent) {
                    iframe.detachEvent('onload',iframe.onload);
                }
                iframe.onload=null;
                iframe.parentNode.removeChild(iframe);
                iframe=null;
			}

        };
        if (iframe.attachEvent) {
            iframe.attachEvent('onload',iframe.onload);
        }
        iframe.src=src;

	}



	var t,supported=['html','htm','txt','str'],t2f=Pkg.fetchers.type2fetcher;
	while (t=supported.pop()) {
		t2f[t]='fetchText';
	}


	return fetchText;
});
