:root{
  --bg:#f4f6f9;
  --panel:#ffffff;
  --border:#e5e7eb;
  --accent:#0f1724;

  --green:#8ce69a;
  --orange:#ffb66b;
  --red:#ff7b7b;
}

*{box-sizing:border-box}
body{
  margin:0;
  font-family: "Inter", Arial, sans-serif;
  background:var(--bg);
  color:var(--accent);
}

/* Barra superior fija */
header{
  display:flex;
  justify-content:space-between;
  align-items:center;
  padding:15px 20px;
  background:linear-gradient(90deg,#0b1220,#0f1724);
  color:white;
  position:sticky;
  top:0;
  z-index:1000;
}

/* Logo */
.brand{
  display:flex;
  align-items:center;
  gap:12px;
}
.logo-box{
  width:50px;
  height:50px;
  background:white;
  border-radius:6px;
  display:flex;
  justify-content:center;
  align-items:center;
  border:2px solid #fff;
  overflow:hidden;
}
.logo-box img{ max-width:100%; max-height:100%; display:block; }

/* Controles */
.controls{
  display:flex;
  gap:10px;
  align-items:center;
}
.controls input{
  padding:8px 12px;
  border-radius:8px;
  border:none;
  background:#ffffff20;
  width:260px;
  color:white;
}
.btn{
  padding:8px 14px;
  border-radius:8px;
  border:none;
  cursor:pointer;
  font-size:14px;
}
.btn-main{ background:#2563eb; color:white; font-weight:600; }
.btn-grey{ background:#e2e8f080; color:white; }

/* Main / tabla */
main{ padding:20px; }
table{
  width:100%;
  border-collapse:collapse;
  background:var(--panel);
  margin-top:10px;
  box-shadow:0 6px 18px rgba(18,20,26,0.06);
}
th, td{
  padding:12px;
  border-bottom:1px solid var(--border);
  text-align:center; /* CENTRADO */
  vertical-align:middle;
}
th{ background:#fafafa; }

.stock-cell-green{ background:var(--green); }
.stock-cell-orange{ background:var(--orange); }
.stock-cell-red{ background:var(--red); }

.stock-input{
  width:70px;
  text-align:center;
  padding:6px;
  border-radius:6px;
  border:1px solid #d1d5db;
  background:transparent;
  font-size:14px;
}

.btn-small{
  padding:6px 10px;
  font-size:14px;
  border-radius:6px;
  border:1px solid #d0d4db;
  background:white;
  cursor:pointer;
  margin:0 3px;
}

.status{
  margin-top:12px;
  padding:10px;
  border-radius:8px;
  background:var(--panel);
  border:1px solid var(--border);
  display:none;
}

.footer-note{
  text-align:center;
  margin-top:12px;
  font-size:14px;
  color:#555;
}

/* Responsive */
@media (max-width:820px){
  .controls input{ width:160px; }
  table{ min-width:600px; }
}
