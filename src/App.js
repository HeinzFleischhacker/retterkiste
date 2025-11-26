import React, { useState, useEffect } from 'react';
import { ShoppingBag, Plus, Minus, Trash2, User, Home, X, Check, Copy, AlertCircle, Wifi, Info, Lock, MapPin, Calendar, Image as ImageIcon } from 'lucide-react';
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged, signOut } from "firebase/auth";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import ReactDOM from 'react-dom/client'; // Import für Fehlerbehebung

// --- DEINE EIGENE DATENBANK KONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyARdxz2PGm8AFDTBhJj7vn4gawFq1_u-Jw",
  authDomain: "retterkiste-stveit.firebaseapp.com",
  projectId: "retterkiste-stveit",
  storageBucket: "retterkiste-stveit.firebasestorage.app",
  messagingSenderId: "14883116246",
  appId: "1:14883116246:web:d0cf6385b00ee377a9e577",
  measurementId: "G-WFD1430VD6"
};

// --- EINSTELLUNGEN ---
const ADMIN_PIN = "1234"; 

// --- Error Boundary ---
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 bg-red-50 text-red-800 border border-red-200 rounded m-4 text-center">
          <h2 className="text-xl font-bold mb-2">Hoppla!</h2>
          <p className="mb-4">Da ist etwas schiefgelaufen.</p>
          <p className="text-xs text-red-400 mb-4">{this.state.error?.toString()}</p>
          <button onClick={() => window.location.reload()} className="bg-red-600 text-white px-6 py-3 rounded-full font-bold shadow-lg">Neu laden</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const Spinner = () => <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-current"></div>;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const SHOP_INFO = {
  name: "Together Point St. Veit",
  logoUrl: "https://i.postimg.cc/qqr1nxns/Logo-Togeter-Point.jpg", 
  address: "Platz am Graben 2, 9300 St. Veit an der Glan",
  pickupTimes: ["Mittwoch: 20:30 – 21:00 Uhr", "Donnerstag: 11:00 – 12:00 Uhr", "Samstag: 20:00 – 20:30 Uhr"],
// ...
  defaultProducts: [
    { 
      name: "Retterkiste gemischt", 
      price: 20.00, 
      description: "Bunte Mischung aus Obst & Gemüse. Wertschätzung ca. 20€", 
      stock: "20",
      // HIER DEN ECHTEN BILD-LINK EINFÜGEN!
      imageUrl: "https://i.postimg.cc/W3xhf5St/Retterkiste.jpg", // <-- HIER ERSETZEN
    },
    { name: "Retterkiste vegetarisch", price: 20.00, description: "Ohne Fleischprodukte. Wertschätzung ca. 20€", stock: "10" },
    { name: "Retterkiste vegan", price: 20.00, description: "Rein pflanzlich. Wertschätzung ca. 20€", stock: "5" },
    { name: "Partykiste", price: 25.00, description: "Ideal für Feiern und Gruppen.", stock: "5" },
    { name: "Süßigkeiten Sackerl", price: 7.00, description: "Naschereien Überraschung.", stock: "15" },
    { name: "Milchprodukte", price: 7.00, description: "Joghurt, Milch, Käse etc.", stock: "10" },
    { name: "Osterhasen - Schokokiste", price: 10.00, description: "Saisonales Special.", stock: "10" },
    { name: "Gebäckkiste (Klein)", price: 5.00, description: "Brot & Gebäck vom Vortag.", stock: "10" },
    { name: "Gebäckkiste (Mittel)", price: 10.00, description: "Große Auswahl an Backwaren.", stock: "10" },
    { name: "Gebäckkiste (Groß)", price: 20.00, description: "XXL Auswahl für Familien oder WG.", stock: "5" },
  ]
};

// --- HILFSFUNKTION FÜR BESTELLFRISTEN ---
const getOrderingStatus = (pickupTimes) => {
  const now = new Date();
  const day = now.getDay(); // 0=So, 1=Mo, 2=Di, 3=Mi, 4=Do, 5=Fr, 6=Sa
  const hour = now.getHours();

  // Definiere die Fristen (Start/Ende Tag und Stunde)
  const rules = {
    'Mittwoch & Donnerstag': {
      startDay: 6, // Donnerstag
      startTime: 21, // 12:00 Uhr
      endDay: 3, // Mittwoch
      endTime: 12, // 12:00 Uhr
    },
    'Samstag': {
      startDay: 3, // Samstag
      startTime: 19, // 21:00 Uhr
      endDay: 5, // Freitag
      endTime: 12, // 12:00 Uhr
    }
  };

  const availableTimes = pickupTimes.filter(time => {
    let ruleKey = '';
    if (time.includes('Mittwoch') || time.includes('Donnerstag')) ruleKey = 'Mittwoch & Donnerstag';
    if (time.includes('Samstag')) ruleKey = 'Samstag';
    
    if (!ruleKey) return false;

    const rule = rules[ruleKey];
    
    const isToday = day === rule.startDay || day === rule.endDay;
    let is_open = false;

    // Logik für Fristen über den Wochenwechsel (Sa -> Mi) oder regulär (Mi -> Fr)
    const isBeforeEnd = day <= rule.endDay && (day < rule.endDay || hour < rule.endTime);
    const isAfterStart = day >= rule.startDay && (day > rule.startDay || hour >= rule.startTime);
    
    // Frist, die über den Wochenwechsel geht (Sa -> Mi)
    if (rule.startDay > rule.endDay) {
        if (isAfterStart || isBeforeEnd) {
             is_open = true;
        }
    } 
    // Frist innerhalb der Woche (Mi -> Fr)
    else {
        if (day >= rule.startDay && day <= rule.endDay) {
             if (day === rule.startDay && hour >= rule.startTime) is_open = true;
             if (day > rule.startDay && day < rule.endDay) is_open = true;
             if (day === rule.endDay && hour < rule.endTime) is_open = true;
        }
    }
    
    return is_open;
  });

  return { 
    availableTimes, 
    allClosed: availableTimes.length === 0 
  };
};

const Navigation = ({ view, setView, cartCount }) => (
  <nav className="bg-emerald-700 text-white p-3 shadow-md sticky top-0 z-50">
    <div className="max-w-4xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4 sm:gap-0">
      <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('shop')}>
        <div className="bg-white p-1 rounded-full h-10 w-10 flex items-center justify-center overflow-hidden shadow-sm">
           <img src={SHOP_INFO.logoUrl} alt="Logo" className="h-full w-full object-contain" />
        </div>
        <div className="flex flex-col leading-none">
          <span className="font-bold text-lg">Together Point</span>
          <span className="text-emerald-200 text-xs">St. Veit an der Glan</span>
        </div>
      </div>
      <div className="flex gap-2 justify-center bg-emerald-800/50 p-1 rounded-full sm:bg-transparent sm:p-0">
        <button onClick={() => setView('shop')} className={`flex items-center gap-1 px-4 py-2 rounded-full transition-all ${view === 'shop' ? 'bg-white text-emerald-800 font-bold shadow' : 'hover:bg-emerald-600'}`}>
          <Home size={18} /> Bestellen
        </button>
        <button onClick={() => setView('cart')} className={`relative flex items-center gap-1 px-4 py-2 rounded-full transition-all ${view === 'cart' ? 'bg-white text-emerald-800 font-bold shadow' : 'hover:bg-emerald-600'}`}>
          <ShoppingBag size={18} /> Einkaufswagen
          {cartCount > 0 && <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-emerald-700">{cartCount}</span>}
        </button>
        <button onClick={() => setView('admin')} className={`flex items-center gap-1 px-4 py-2 rounded-full transition-all ${view === 'admin' ? 'bg-white text-emerald-800 font-bold shadow' : 'hover:bg-emerald-600'}`}>
          <User size={18} />
        </button>
      </div>
    </div>
  </nav>
);

const ShopView = ({ addToCart, cart, updateQuantity }) => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'products'), s => {
      setProducts(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name)));
      setLoading(false);
    }, err => { console.error(err); setLoading(false); });
    return () => unsub();
  }, []);

  if (loading) return <div className="p-20 text-center text-gray-500 flex flex-col items-center gap-4"><Spinner />Lade Shop...</div>;

  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-8 bg-white p-6 rounded-xl border border-emerald-100 shadow-sm relative overflow-hidden">
        <div className="flex flex-col md:flex-row gap-6 items-center relative z-10">
          <div className="bg-white p-2 rounded-xl shadow-md border border-emerald-50 h-28 w-28 flex items-center justify-center shrink-0"><img src={SHOP_INFO.logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" /></div>
          <div className="text-center md:text-left flex-1">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Retterkiste bestellen</h1>
            <p className="text-gray-600 mb-4">Willkommen beim Together Point St. Veit!</p>
            <div className="inline-flex items-center gap-2 bg-emerald-50 px-3 py-1 rounded-full text-sm text-emerald-800 font-medium"><MapPin size={14}/> {SHOP_INFO.address}</div>
          </div>
        </div>
      </header>
      {products.length === 0 ? (
        <div className="text-center p-12 bg-white rounded-xl shadow-sm border border-gray-100">
          <ShoppingBag size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-xl font-bold text-gray-400">Keine Produkte online</h3>
          <p className="text-gray-400 mt-2">Schau später nochmal vorbei!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map(product => {
            const cartItem = cart.find(item => item.id === product.id);
            const qty = cartItem ? cartItem.quantity : 0;
            
            return (
              <div key={product.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all flex flex-col relative group">
                <div className="h-32 bg-emerald-50/50 flex items-center justify-center relative group-hover:bg-emerald-50 transition-colors overflow-hidden">
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" onError={(e) => e.target.style.display = 'none'} />
                  ) : (
                    <ShoppingBag size={40} className="text-emerald-200 group-hover:text-emerald-300 transition-colors" />
                  )}
                  {product.stock && <div className="absolute top-2 right-2 bg-white/90 text-emerald-800 text-[10px] font-bold px-2 py-1 rounded-full border border-emerald-100 shadow-sm">Noch {product.stock}</div>}
                </div>
                <div className="p-5 flex-1 flex flex-col">
                  <h3 className="font-bold text-gray-800 mb-1 text-lg">{product.name}</h3>
                  <p className="text-gray-500 text-sm mb-4 flex-1 leading-snug">{product.description}</p>
                  <div className="mt-auto pt-4 border-t border-gray-50 flex items-center justify-between">
                     <div className="flex flex-col">
                        <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded text-sm w-fit">{Number(product.price).toFixed(2)} €</span>
                        <span className="text-[10px] text-gray-400 ml-1">Wertschätzung</span>
                     </div>
                     
                     <div className="flex items-center gap-2">
                        {qty > 0 ? (
                          <>
                            <button onClick={() => updateQuantity(product.id, -1)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"><Minus size={16} /></button>
                            <span className="font-bold text-gray-800 w-6 text-center">{qty}</span>
                            <button onClick={() => updateQuantity(product.id, 1)} className="bg-emerald-600 hover:bg-emerald-700 text-white w-8 h-8 rounded-lg flex items-center justify-center transition-colors shadow-sm"><Plus size={16} /></button>
                          </>
                        ) : (
                          <button onClick={() => addToCart(product)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors shadow-sm shadow-emerald-200 flex items-center gap-1">
                            <Plus size={16} /> Hinzufügen
                          </button>
                        )}
                     </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const CartView = ({ cart, updateQuantity, removeFromCart, setView, total }) => {
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', pickupTime: '', isMember: '', note: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [user, setUser] = useState(null);
  const { availableTimes, allClosed } = getOrderingStatus(SHOP_INFO.pickupTimes); // <-- NEU: Rufe Status ab

  useEffect(() => { return onAuthStateChanged(auth, setUser); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return alert("Nicht verbunden. Bitte Seite neu laden.");
    if (allClosed) return alert("Bestellungen sind momentan geschlossen."); // NEU: Schließe ab, falls alle zu sind
    if (!formData.isMember) return alert("Bitte gib an, ob du Vereinsmitglied bist.");
    if (!formData.pickupTime) return alert("Bitte wähle eine Abholzeit.");
    
    // NEU: Zusätzlicher Check, falls die gewählte Zeit gerade geschlossen wurde
    if (!availableTimes.includes(formData.pickupTime)) {
        return alert("Die gewählte Abholzeit ist momentan geschlossen. Bitte wähle eine andere Zeit.");
    }
    
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'orders'), { customer: formData, items: cart, total, status: 'neu', createdAt: serverTimestamp(), userId: user.uid });
      setOrderSuccess(true);
    } catch (error) { alert("Fehler: " + error.message); } finally { setIsSubmitting(false); }
  };

  const crateCount = cart.filter(i => i.name.toLowerCase().includes('kiste') || i.name.toLowerCase().includes('box')).reduce((s, i) => s + i.quantity, 0);

  if (orderSuccess) return (
    <div className="max-w-md mx-auto mt-10 p-8 bg-white rounded-xl shadow-lg text-center border border-emerald-100">
      <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm"><Check size={40} strokeWidth={3}/></div>
      <h2 className="text-2xl font-bold mb-2 text-gray-800">Vielen Dank!</h2>
      <p className="text-gray-600 mb-8">Deine Bestellung ist eingegangen.</p>
      <button onClick={() => window.location.reload()} className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-full font-bold transition-transform active:scale-95 shadow-md shadow-emerald-200">Neue Bestellung</button>
    </div>
  );

  if (cart.length === 0) return (
    <div className="text-center mt-20">
      <div className="inline-block p-6 bg-gray-50 rounded-full mb-4"><ShoppingBag size={48} className="text-gray-300" /></div>
      <h2 className="text-xl font-medium text-gray-600">Dein Einkaufswagen ist leer</h2>
      <button onClick={() => setView('shop')} className="mt-4 text-emerald-600 font-bold hover:underline">Zurück zu Bestellen</button>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
      <div className="lg:col-span-5 bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit">
        <h2 className="font-bold text-lg mb-4 flex items-center gap-2"><ShoppingBag size={20}/> Einkaufswagen</h2>
        {cart.map((item) => (
          <div key={item.id} className="flex justify-between items-center py-4 border-b border-gray-50 last:border-0">
            <div><div className="font-bold text-gray-800">{item.name}</div><div className="text-xs text-emerald-600 font-medium">{Number(item.price).toFixed(2)} €</div></div>
            <div className="flex items-center gap-3">
              <div className="flex items-center bg-gray-50 rounded-lg border border-gray-200">
                <button onClick={() => updateQuantity(item.id, -1)} className="p-1 hover:bg-white rounded transition-colors"><Minus size={14} /></button>
                <span className="text-sm font-bold w-6 text-center">{item.quantity}</span>
                <button onClick={() => updateQuantity(item.id, 1)} className="p-1 hover:bg-white rounded transition-colors"><Plus size={14} /></button>
              </div>
              <button onClick={() => removeFromCart(item.id)} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={18}/></button>
            </div>
          </div>
        ))}
        {crateCount >= 2 && <div className="mt-4 p-3 bg-orange-50 text-orange-800 text-xs rounded-lg border border-orange-100 flex gap-2 items-start"><Info size={16} className="shrink-0 mt-0.5"/><span><b>Hinweis:</b> Maximal 2 Kisten pro Person, damit für alle genug da ist.</span></div>}
        <div className="mt-4 pt-4 border-t border-gray-100 font-bold text-lg flex justify-between text-gray-800"><span>Summe</span><span>{total.toFixed(2)} €</span></div>
      </div>
      <div className="lg:col-span-7 bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit">
        <h2 className="font-bold text-lg mb-6 flex items-center gap-2"><User size={20}/> Abholung</h2>
        {allClosed && (
            <div className="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg" role="alert">
                <span className="font-bold">Bestellungen geschlossen:</span> Momentan ist unser Bestellfenster nicht aktiv.
            </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-bold uppercase mb-2 text-gray-500">Bist du Mitglied im Verein? *</label>
            <div className="flex gap-4">
              <label className={`flex-1 border p-3 rounded-lg text-center cursor-pointer transition-all ${formData.isMember === 'ja' ? 'bg-emerald-50 border-emerald-500 text-emerald-700 font-bold shadow-sm' : 'hover:bg-gray-50'}`}><input type="radio" name="mem" className="hidden" onChange={() => setFormData({...formData, isMember: 'ja'})} /> Ja</label>
              <label className={`flex-1 border p-3 rounded-lg text-center cursor-pointer transition-all ${formData.isMember === 'nein' ? 'bg-gray-100 border-gray-400 text-gray-800 font-bold' : 'hover:bg-gray-50'}`}><input type="radio" name="mem" className="hidden" onChange={() => setFormData({...formData, isMember: 'nein'})} /> Nein</label>
            </div>
          </div>
          <div className="space-y-4">
            <input required className="w-full border border-gray-200 p-3 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Vor- und Nachname *" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            <input required type="email" className="w-full border border-gray-200 p-3 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Email-Adresse *" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
            <input type="tel" className="w-full border border-gray-200 p-3 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Telefonnummer (Optional)" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase mb-2 text-gray-500">Abholzeit wählen *</label>
            <div className="space-y-2">
              {SHOP_INFO.pickupTimes.map(t => {
                const isTimeAvailable = availableTimes.includes(t); // NEU: Check, ob die Zeit buchbar ist
                
                return (
                  <label key={t} className={`block border p-3 rounded-lg cursor-pointer transition-all flex items-center gap-3 ${formData.pickupTime === t ? 'bg-emerald-50 border-emerald-500 ring-1 ring-emerald-500' : 'hover:bg-gray-50 border-gray-200'} ${!isTimeAvailable && 'opacity-50 cursor-not-allowed bg-gray-100'}`} disabled={!isTimeAvailable}>
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${formData.pickupTime === t && isTimeAvailable ? 'border-emerald-600' : 'border-gray-300'}`}>
                      {formData.pickupTime === t && isTimeAvailable && <div className="w-2 h-2 rounded-full bg-emerald-600"/>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar size={16} className="text-gray-400"/>
                      <input type="radio" name="time" className="hidden" 
                             onChange={() => isTimeAvailable && setFormData({...formData, pickupTime: t})} 
                             disabled={!isTimeAvailable} /> 
                      <span className="text-sm text-gray-700">{t} {!isTimeAvailable && ' (Geschlossen)'}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
          <textarea className="w-full border border-gray-200 p-3 rounded-lg h-24 focus:ring-2 focus:ring-emerald-500 outline-none resize-none" placeholder="Anmerkung (Allergien, Wünsche)..." value={formData.note} onChange={e => setFormData({...formData, note: e.target.value})} />
          <button type="submit" disabled={isSubmitting || allClosed} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl transition-transform active:scale-95 shadow-lg shadow-emerald-200 flex justify-center items-center gap-2 disabled:bg-gray-400">
            {isSubmitting ? <><Spinner/> Sende...</> : 'Verbindlich Reservieren'}
          </button>
        </form>
      </div>
    </div>
  );
};

const AdminView = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState("");
  const [activeTab, setActiveTab] = useState('orders');
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [newProduct, setNewProduct] = useState({ name: '', price: '', description: '', stock: '10', imageUrl: '' });
  const [user, setUser] = useState(null);
  const [isBulkLoading, setIsBulkLoading] = useState(false);

  useEffect(() => { return onAuthStateChanged(auth, setUser); }, []);

  useEffect(() => {
    if (!user || !isAuthenticated) return;
    const unsubO = onSnapshot(collection(db, 'orders'), s => setOrders(s.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0))));
    const unsubP = onSnapshot(collection(db, 'products'), s => setProducts(s.docs.map(d => ({id: d.id, ...d.data()}))));
    return () => { unsubO(); unsubP(); };
  }, [user, isAuthenticated]);

  const handleLogin = (e) => {
    e.preventDefault();
    if (pin === ADMIN_PIN) setIsAuthenticated(true);
    else alert("Falsche PIN");
  };

  const copyList = () => {
    const text = orders.map(o => `[${o.status}] ${o.customer.name} | ${o.items.map(i=>`${i.quantity}x ${i.name}`).join(', ')} | ${o.total}€`).join('\n');
    navigator.clipboard.writeText(text); alert("Kopiert!");
  };

  const loadDefaults = async () => {
    setIsBulkLoading(true);
    try {
      let count = 0;
      for (const p of SHOP_INFO.defaultProducts) {
        await addDoc(collection(db, 'products'), { ...p, createdAt: serverTimestamp() });
        count++;
      }
      alert(`Erfolg! ${count} Produkte geladen.`);
    } catch (e) { alert(`FEHLER: ${e.message}`); } finally { setIsBulkLoading(false); }
  };

  const addProduct = async (e) => {
    e.preventDefault();
    await addDoc(collection(db, 'products'), { ...newProduct, price: parseFloat(newProduct.price), createdAt: serverTimestamp() });
    setNewProduct({ name: '', price: '', description: '', stock: '10', imageUrl: '' });
  };

  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto mt-20 p-8 bg-white rounded-xl shadow border border-gray-200 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-500"><Lock size={32}/></div>
        <h2 className="text-xl font-bold text-gray-800 mb-4">Händler-Bereich</h2>
        <form onSubmit={handleLogin} className="space-y-4">
          <input type="password" autoFocus className="w-full border p-3 rounded-lg text-center text-lg tracking-widest" placeholder="PIN eingeben" value={pin} onChange={e => setPin(e.target.value)} />
          <button type="submit" className="w-full bg-emerald-600 text-white font-bold py-3 rounded-lg hover:bg-emerald-700">Anmelden</button>
        </form>
        <p className="text-xs text-gray-400 mt-4">Standard-PIN ist 1234</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className={`mb-6 p-3 rounded-lg text-sm font-bold flex justify-between items-center ${user ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' : 'bg-red-50 text-red-800'}`}>
        <span className="flex items-center gap-2">{user ? <Wifi size={18}/> : <AlertCircle size={18}/>} Status: {user ? "Online & Verbunden" : "Offline"}</span>
        <button onClick={() => setIsAuthenticated(false)} className="text-xs underline">Abmelden</button>
      </div>
      <div className="flex gap-2 mb-6 border-b pb-4 overflow-x-auto">
        <button onClick={() => setActiveTab('orders')} className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${activeTab === 'orders' ? 'bg-emerald-100 text-emerald-800' : 'text-gray-500 hover:bg-gray-100'}`}>Bestellungen ({orders.length})</button>
        <button onClick={() => setActiveTab('products')} className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${activeTab === 'products' ? 'bg-emerald-100 text-emerald-800' : 'text-gray-500 hover:bg-gray-100'}`}>Produkte verwalten</button>
        {activeTab === 'orders' && <button onClick={copyList} className="ml-auto bg-gray-100 px-3 py-2 rounded-lg text-xs flex items-center gap-2 hover:bg-gray-200 font-bold text-gray-600"><Copy size={14}/> Liste kopieren</button>}
      </div>

      {activeTab === 'products' && (
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 h-fit">
            <h3 className="font-bold text-lg mb-4 text-gray-800">Neues Produkt</h3>
            <form onSubmit={addProduct} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Name</label>
                <input className="w-full border p-2 rounded-lg text-sm" placeholder="z.B. Veggie Kiste" value={newProduct.name} onChange={e=>setNewProduct({...newProduct, name: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase">Preis</label>
                  <input className="w-full border p-2 rounded-lg text-sm" type="number" placeholder="20.00" value={newProduct.price} onChange={e=>setNewProduct({...newProduct, price: e.target.value})} />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase">Vorrat</label>
                  <input className="w-full border p-2 rounded-lg text-sm" placeholder="10" value={newProduct.stock} onChange={e=>setNewProduct({...newProduct, stock: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Bild-Link (Optional)</label>
                <div className="flex items-center gap-2">
                  <input className="w-full border p-2 rounded-lg text-sm" placeholder="https://..." value={newProduct.imageUrl} onChange={e=>setNewProduct({...newProduct, imageUrl: e.target.value})} />
                  <ImageIcon size={16} className="text-gray-400" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Info</label>
                <textarea className="w-full border p-2 rounded-lg text-sm h-20 resize-none" placeholder="Beschreibung..." value={newProduct.description} onChange={e=>setNewProduct({...newProduct, description: e.target.value})} />
              </div>
              <button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-lg text-sm transition-colors">Speichern</button>
            </form>
            <div className="mt-6 pt-6 border-t border-gray-100">
              <button onClick={loadDefaults} disabled={isBulkLoading} className="w-full bg-gray-50 text-gray-600 text-xs py-2.5 rounded-lg font-bold border border-gray-200 hover:bg-gray-100 flex justify-center items-center gap-2">
                {isBulkLoading ? <><Spinner /> Lade...</> : "Standard-Produkte laden"}
              </button>
            </div>
          </div>
          <div className="md:col-span-2 space-y-3">
            {products.length === 0 && <div className="text-gray-400 italic text-center p-8 bg-gray-50 rounded-xl border border-dashed border-gray-300">Keine Produkte vorhanden.</div>}
            {products.map(p => (
              <div key={p.id} className="bg-white p-4 border border-gray-100 rounded-xl shadow-sm flex justify-between items-center group hover:border-emerald-200 transition-colors">
                <div className="flex gap-3 items-center">
                  <div className="w-10 h-10 rounded bg-gray-100 flex-shrink-0 overflow-hidden">
                    {p.imageUrl ? <img src={p.imageUrl} alt="" className="w-full h-full object-cover" /> : <ShoppingBag className="m-2 text-gray-300"/>}
                  </div>
                  <div><div className="font-bold text-gray-800">{p.name}</div><div className="text-xs text-gray-500">{p.description} • Lager: {p.stock}</div></div>
                </div>
                <div className="flex items-center gap-4"><span className="font-bold text-sm text-emerald-600 bg-emerald-50 px-2 py-1 rounded">{p.price}€</span><button onClick={() => deleteDoc(doc(db, 'products', p.id))} className="text-gray-300 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition-all"><Trash2 size={18}/></button></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'orders' && (
        <div className="space-y-3">
          {orders.length === 0 && <div className="text-center p-10 text-gray-400">Keine Bestellungen.</div>}
          {orders.map(o => (
            <div key={o.id} className="bg-white p-5 border border-gray-200 rounded-xl shadow-sm flex flex-col md:flex-row justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${o.status === 'neu' ? 'bg-blue-100 text-blue-700' : o.status === 'erledigt' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{o.status}</span>
                  <span className="text-xs text-gray-400">{o.createdAt?.seconds ? new Date(o.createdAt.seconds * 1000).toLocaleString('de-DE') : ''}</span>
                </div>
                <div className="font-bold text-lg text-gray-800">{o.customer.name}</div>
                <div className="text-sm text-gray-600">{o.customer.email} • {o.customer.pickupTime}</div>
                {o.customer.note && <div className="bg-yellow-50 text-yellow-800 p-2 mt-2 rounded-lg text-xs border border-yellow-100 italic">"{o.customer.note}"</div>}
              </div>
              <div className="md:text-right flex flex-col justify-between">
                <div className="space-y-1">
                  {o.items.map((i, idx) => <div key={idx} className="text-sm text-gray-700"><span className="font-bold">{i.quantity}x</span> {i.name}</div>)}
                  <div className="font-bold mt-2 text-emerald-700 text-lg">{o.total.toFixed(2)} €</div>
                </div>
                <div className="flex gap-2 justify-end mt-3">
                  <button onClick={() => updateDoc(doc(db, 'orders', o.id), {status: 'erledigt'})} className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border border-emerald-200">Erledigt</button>
                  <button onClick={() => updateDoc(doc(db, 'orders', o.id), {status: 'storno'})} className="bg-gray-50 hover:bg-red-50 text-gray-500 hover:text-red-600 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border border-gray-200 hover:border-red-200">Storno</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const App = () => {
  const [view, setView] = useState('shop');
  const [cart, setCart] = useState([]);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const resetAuth = async () => { try { await signOut(auth); await signInAnonymously(auth); } catch (e) { console.error(e); } };
    resetAuth(); return onAuthStateChanged(auth, setUser);
  }, []);

  const isCrate = (name) => name.toLowerCase().includes('kiste') || name.toLowerCase().includes('box');

  const addToCart = (p) => setCart(prev => {
    if (isCrate(p.name)) {
      const currentCrates = prev.filter(i => isCrate(i.name)).reduce((s, i) => s + i.quantity, 0);
      if (currentCrates >= 2) { alert("Max. 2 Kisten erlaubt."); return prev; }
    }
    const ex = prev.find(i => i.id === p.id);
    return ex ? prev.map(i => i.id === p.id ? { ...i, quantity: i.quantity + 1 } : i) : [...prev, { ...p, quantity: 1 }];
  });

  const updateQty = (id, d) => setCart(prev => {
    const item = prev.find(i => i.id === id);
    if (d > 0 && item && isCrate(item.name)) {
        const currentCrates = prev.filter(i => isCrate(i.name)).reduce((s, i) => s + i.quantity, 0);
        if (currentCrates >= 2) { alert("Max. 2 Kisten erlaubt."); return prev; }
    }
    return prev.map(i => i.id === id ? { ...i, quantity: Math.max(0, i.quantity + d) } : i).filter(i => i.quantity > 0);
  });

  const rem = (id) => setCart(prev => prev.filter(i => i.id !== id));
  const total = cart.reduce((sum, i) => sum + (i.price * i.quantity), 0);
  const count = cart.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50 font-sans text-gray-800 pb-20 selection:bg-emerald-100">
        <Navigation view={view} setView={setView} cartCount={count} />
        <main className="p-4 md:p-8">
          {view === 'shop' && <ShopView addToCart={addToCart} cart={cart} updateQuantity={updateQty} />}
          {view === 'cart' && <CartView cart={cart} updateQuantity={updateQty} removeFromCart={rem} total={total} setView={setView} />}
          {view === 'admin' && <AdminView />}
        </main>
      </div>
    </ErrorBoundary>
  );
};

export default App;
