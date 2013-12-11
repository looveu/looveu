Pkg.define('Looveu.Window',['Looveu.ui.Button','Looveu.util.String'],{
	html:'window.html',
    db:'db.json',
    _style:'css/style.css'
},function () {
	var html=this.assets.html;
	var div=document.createElement('DIV');
    console.log(this.assets.db);
	div.innerHTML=html;
		document.body.appendChild(div);
	return {name:'Window'};
})
