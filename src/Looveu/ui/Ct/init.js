Pkg.define('Looveu.ui.Ct',['Looveu.dom.Style','Looveu.dom.Node'],function () {
	var btn=this.assets.tpl;
	function Ct(ct) {
		ct.innerHTML+=btn;
	}

	return Ct;
});
