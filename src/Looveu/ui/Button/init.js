Pkg.define('Looveu.ui.Button',['Looveu.query'],function (query) {
	var btn=this.assets.tpl;
	function Button(ct) {
		ct.innerHTML=btn;
	}
	return Button;
});
