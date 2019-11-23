const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
var hash = require('pbkdf2-password')()
var path = require('path');
var session = require('express-session');
const uuidv4 = require('uuid/v4');


const app = express()
app.use(express.static('public'));
app.use('/static', express.static(__dirname + '/public'));

// config
app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'));


// config firebase
var firebase = require('firebase');
var firebaseConfig = require(path.join(__dirname, 'config'));
firebase.initializeApp(firebaseConfig);

// middleware
app.use(express.urlencoded({ extended: false }))
app.use(session({
  resave: false, // no guarde sesión si no se modifica
  saveUninitialized: false, // don't create session until something stored
  secret: 'shhhh, very secret'
}));

// Session-persisted message middleware
app.use(function(req, res, next){
  var err = req.session.error;
  var msg = req.session.success;
  delete req.session.error;
  delete req.session.success;
  res.locals.message = '';
  if (err) res.locals.message = '<div class="alert alert-danger" role="alert">' + err + '</div>';
  if (msg) res.locals.message = '<div class="alert alert-success" role="alert">' + msg + '</div>';
  next();
});


/* 
 Funcion para validar la autenticación con Firebase
*/
async function authenticate(email, pass, fn) {
   const userFirebase = await firebase.auth().signInWithEmailAndPassword(email, pass)
        .then(function ()
        {
          user = firebase.auth().currentUser;  
          fn(null, user);
      })
      .catch(async function(login_error)
      {
          //let loginErrorCode = login_error.code;
          //let loginErrorMessage = login_error.message;
          //console.log(loginErrorCode);
          //console.log(loginErrorMessage);
          fn(login_error);
      });
}        



/* 
 Funcion para validar la autenticación con Firebase
*/
async function create_user(name, email, pass, fn) {
   const userFirebase = await firebase.auth().createUserWithEmailAndPassword(email, pass)
        .then(function ()
        {
          user = firebase.auth().currentUser;  
          user.updateProfile({
            displayName: name,
            //photoURL: "https://tufofo.com/pollo.jpg"
          }).then(function() {
           fn(null, user)
          }).catch(function(error) {
            fn(error);
          });
      })
      .catch(async function(login_error)
      {
          fn(login_error);
      });
}  

/*Validamos al usuario*/
function restrict(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    req.session.error = 'Access denied!';
    res.redirect('/login');
  }
}

app.get('/', function(req, res){
  res.redirect('/login');
});

app.get('/restricted', restrict, function(req, res){
  res.send('Wahoo! área restringida, haga clic <a href="/logout">logout</a>');
});

app.get('/logout', function(req, res){
  // destruye la sesión del usuario para cerrar sesión
  // se volverá a crear la próxima solicitud
  req.session.destroy(function(){
    res.redirect('/');
  });
});

app.get('/login', function(req, res){
  res.render('login');
});

app.post('/login', function(req, res){
  authenticate(req.body.username, req.body.password, function(err, user){
     //se valida al usuario
    if (user) {
      // Regenerar sesión al iniciar sesión
      // para evitar la fijación
      req.session.regenerate(function(){
        // Almacenar la clave primaria del usuario
        // en el almacén de sesión que se va a recuperar,
        // o en este caso el objeto de usuario completo
        req.session.user = user;
        req.session.success = 'Authenticated as ' + user.displayName
          + ' haga clic para <a href="/logout">logout</a>. '
          + ' Ahora puede acceder <a href="/tokens">/tokens</a>.';
        res.redirect('/tokens');
      });
    } else {
      req.session.error =
          err.code
        + err.message;
      res.redirect('/login');
    }
  });
});


app.get('/create_account', function(req, res){
  res.render('create_account');
});

app.post('/create_account', function(req, res){
  create_user(req.body.name, req.body.username, req.body.password, function(err, user){
    if (user) {
      //se crea el usuario
      req.session.regenerate(function(){
        // Almacenar la clave primaria del usuario
        // en el almacén de sesión que se va a recuperar,
        // o en este caso el objeto de usuario completo
        req.session.user = user;
        req.session.success = 'Authenticated as ' + user.displayName
          + ' haga clic para <a href="/logout">logout</a>. '
          + ' Ahora puede acceder <a href="/tokens">/tokens</a>.';
        res.redirect('/tokens');
      });
    } else {
      //Si se genera un error con el usuario
      req.session.error =
          err.code
        + err.message;
      res.redirect('/login');
    }
  });
});

app.get('/tokens', restrict, async function(req, res){
  var tokens = [];
  var dbUser = 'tokens-'+req.session.user.uid;
  var displayName = req.session.user.displayName;
  console.log(displayName)
  if(!displayName){
    res.redirect('/login');

  }else{
    var db = firebase.database();  
    var ref = db.ref(dbUser);
    var cien_tokens = await ref.on("value", function(snapshot) {
      if (snapshot.exists()){
        console.log("exists!");
      }else{
        console.log("No exists!");

        for (var i = 0; i < 100; i++){
          var name = "token-"+i;
          tokens[name] = {};
          tokens[name]["token"] = uuidv4();
          tokens[name]["sale_value"] = "10000";
          tokens[name]["changes"] = 0;
          tokens[name]["date"] = new Date().toISOString().
                                            replace(/T/, ' ').     
                                            replace(/\..+/, '') ;
        }

        db.ref('list-user').push({
          database: dbUser,
          nameuser: displayName
        });

        db.ref('tokens-'+req.session.user.uid).set({
          tokens
        });


        
      }
      
    }, function (errorObject) {
      console.log("Error exists!");
      for (var i = 0; i < 100; i++){
        var name = "token-"+i;
        tokens[name] = {};
        tokens[name]["token"] = uuidv4();
        tokens[name]["sale_value"] = "10000";
        tokens[name]["changes"] = 0;
        tokens[name]["date"] = new Date().toISOString().
                                          replace(/T/, ' ').     
                                          replace(/\..+/, '') ;
      }

      db.ref('tokens-'+req.session.user.uid).set({
        tokens
      });


    });
    
    res.render('tokens',{
      firebaseConfig: firebaseConfig,
      uid: req.session.user.uid
    });
  }

  
});


app.get('/buy', restrict, function(req, res){
  res.render('buy',{
    firebaseConfig: firebaseConfig,
    uid: req.session.user.uid,
    displayName: req.session.user.displayName
  });
});

app.get('/history', restrict, function(req, res){
  res.render('history',{
    firebaseConfig: firebaseConfig,
    uid: req.session.user.uid,
    displayName: req.session.user.displayName
  });
});

/* Iniciamos el servidor */
app.listen(3000, function () {
  console.log('Example app listening on port 3000!')
})