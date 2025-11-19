let cart = [];
let userId = null;
let locationData = null;

const db = window.db;
const doc = window.doc;
const setDoc = window.setDoc;
const getDoc = window.getDoc;

// -------------------- Storage Keys --------------------
function getSessionCartKey() {
    return userId ? `nog_cart_session_${userId}` : 'nog_cart_session_guest';
}
function getLocalCartKey() {
    return userId ? 'nog_cart_v1_' + userId : 'nog_cart_v1_guest';
}
function getSessionLocationKey() {
    return userId ? `nog_location_session_${userId}` : 'nog_location_session_guest';
}
function getLocalLocationKey() {
    return userId ? `nog_location_${userId}` : 'nog_location_guest';
}

// -------------------- CART --------------------
function saveCart() {
    sessionStorage.setItem(getSessionCartKey(), JSON.stringify(cart));

    if (userId) {
        localStorage.setItem(getLocalCartKey(), JSON.stringify(cart));
        syncCartToFirestore();
    }
    updateCartCount();
}

function loadCart() {
    try {
        cart = JSON.parse(sessionStorage.getItem(getSessionCartKey())) || [];
        if (!Array.isArray(cart)) cart = [];
    } catch (e) {
        cart = [];
    }
    updateCartCount();
    renderCart();
}

function updateCartCount() {
    const count = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
    document.querySelectorAll('#cart-count').forEach(el => el.textContent = count);
}

function addToCart(name, price, image) {
    price = Number(price);
    const existing = cart.find(i => i.name === name);
    if (existing) {
        existing.quantity = (existing.quantity || 1) + 1;
    } else {
        cart.push({
            id: Date.now() + Math.floor(Math.random() * 1000),
            name,
            price,
            quantity: 1,
            image
        });
    }
    saveCart();
    renderCart();
    showAddToCartMessage();

}

function renderCart() {
    const cartList = document.getElementById('cart-list');
    const preview = document.getElementById('preview-items');
    const subtotalEl = document.getElementById('subtotal');
    const shippingEl = document.getElementById('shipping');
    const totalEl = document.getElementById('total');
    const emptyMsg = document.getElementById('cart-empty');

    if (!cartList || !preview || !subtotalEl || !shippingEl || !totalEl || !emptyMsg) return;

    cartList.innerHTML = '';
    preview.innerHTML = '';

    if (cart.length === 0) {
        emptyMsg.style.display = 'block';
    } else {
        emptyMsg.style.display = 'none';
    }

    let subtotal = 0;

    cart.forEach(item => {
        const itemTotal = item.price * item.quantity;
        subtotal += itemTotal;

        const div = document.createElement('div');
        div.className = 'item';
        div.innerHTML = `
            <div class="thumb">${item.name[0]}</div>
            <div class="meta">
                <div class="title">${item.name}</div>
                <div class="sku">EGP ${item.price} x ${item.quantity}</div>
                <div class="controls">
                    <div class="qty">
                        <button class="dec" data-id="${item.id}">-</button>
                        <input type="number" value="${item.quantity}" min="1" data-id="${item.id}">
                        <button class="inc" data-id="${item.id}">+</button>
                    </div>
                    <button class="remove" data-id="${item.id}">Remove</button>
                </div>
            </div>
            <div class="price">EGP ${itemTotal}</div>
        `;
        cartList.appendChild(div);

        const p = document.createElement('div');
        p.textContent = `${item.name} x ${item.quantity} — EGP ${itemTotal}`;
        preview.appendChild(p);
    });

    const shipping = subtotal > 0 ? 50 : 0;
    const total = subtotal + shipping;

    subtotalEl.textContent = subtotal;
    shippingEl.textContent = shipping;
    totalEl.textContent = total;

    document.querySelectorAll('.inc').forEach(btn => {
        btn.onclick = () => {
            const id = Number(btn.dataset.id);
            const item = cart.find(i => i.id === id);
            if (item) item.quantity++;
            saveCart();
            renderCart();
        };
    });

    document.querySelectorAll('.dec').forEach(btn => {
        btn.onclick = () => {
            const id = Number(btn.dataset.id);
            const item = cart.find(i => i.id === id);
            if (item && item.quantity > 1) item.quantity--;
            saveCart();
            renderCart();
        };
    });

    document.querySelectorAll('.remove').forEach(btn => {
        btn.onclick = () => {
            const id = Number(btn.dataset.id);
            cart = cart.filter(i => i.id !== id);
            saveCart();
            renderCart();
        };
    });

    updateCartCount();
}

// -------------------- CHECKOUT --------------------
async function handleCheckout() {
    try {
        const response = await fetch('/create-checkout-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cart })
        });
        const session = await response.json();
        const stripe = Stripe('pk_test_TY8mQ3y9L52s6s6s6s6s6s6s');
        stripe.redirectToCheckout({ sessionId: session.id });
    } catch (error) {
        console.error('Error:', error);
    }
}

// -------------------- FIRESTORE CART --------------------
async function syncCartToFirestore() {
    if (!userId) return;
    try {
        await setDoc(doc(db, "users", userId), { cart }, { merge: true });
    } catch (e) {
        console.error("Firestore sync error:", e);
    }
}

async function loadCartFromFirestore(uid) {
    const guestCart = JSON.parse(sessionStorage.getItem(getSessionCartKey())) || [];
    userId = uid;
    try {
        const snap = await getDoc(doc(db, "users", userId));
        let firestoreCart = snap.exists() ? snap.data().cart || [] : [];
        cart = mergeCarts(firestoreCart, guestCart);
        saveCart();
    } catch (e) {
        console.error("Firestore load error:", e);
        cart = guestCart;
        saveCart();
    }
    renderCart();
}

function mergeCarts(cart1, cart2) {
    const merged = [...cart1];
    cart2.forEach(item2 => {
        const existing = merged.find(i => i.name === item2.name);
        if (existing) {
            existing.quantity += item2.quantity;
        } else {
            merged.push(item2);
        }
    });
    return merged;
}

// -------------------- LOCATION --------------------
function saveLocation(location) {
    locationData = location;

    sessionStorage.setItem(getSessionLocationKey(), JSON.stringify(location));

    if (userId) {
        localStorage.setItem(getLocalLocationKey(), JSON.stringify(location));
        setDoc(doc(db, "users", userId), { location }, { merge: true });
    }
}

// -------------------- LOGIN / LOGOUT --------------------
function onLogin(auth0UserId) {
    loadCartFromFirestore(auth0UserId);
}

function onLogout() {
    cart = [];
    userId = null;
    sessionStorage.removeItem(getSessionCartKey());
    sessionStorage.removeItem(getSessionLocationKey());
    renderCart();
}

// -------------------- INIT --------------------
document.addEventListener('DOMContentLoaded', () => {
    loadCart();
    // Do NOT automatically load location

    document.getElementById('checkout-now')?.addEventListener('click', handleCheckout);
    document.getElementById('clear-cart')?.addEventListener('click', () => {
        cart = [];
        saveCart();
        renderCart();
    });

    // -------------------- BUTTON LOCATION DETECTION --------------------
    document.getElementById('detect-location')?.addEventListener('click', () => {
        if (!navigator.geolocation) {
            alert("Geolocation is not supported by your browser.");
            return;
        }

        navigator.geolocation.getCurrentPosition(
            pos => {
                const coords = {
                    lat: pos.coords.latitude,
                    lon: pos.coords.longitude
                };
                saveLocation(coords); // save fresh location
                alert("Location saved: " + coords.lat + ", " + coords.lon);
            },
            err => {
                console.error("Location error:", err);
                alert("Unable to detect location.");
            }
        );
    });
});
const firebaseConfig = {
 apiKey:"AIzaSyCl2VZqcUi1rtso-_CzBwhnlGYGqydEiRU",
  authDomain:"nogalim-58121.firebaseapp.com",
  projectId: "nogalim-58121",
  storageBucket: "nogalim-58121.firebasestorage.app",
  messagingSenderId: "791547602130",
  appId: "1:791547602130:web:34b88883dec222718b790b",
};

firebase.initializeApp(firebaseConfig);
window.db = firebase.firestore();
window.doc = firebase.firestore().doc;
window.getDoc = firebase.firestore().getDoc;
window.setDoc = firebase.firestore().setDoc;
document.addEventListener('DOMContentLoaded', () => {
  function wireButtons() {
    document.querySelectorAll('.add-to-cart').forEach(btn => {
      if (btn.dataset.bound) return; // avoid double binding
      btn.addEventListener('click', () => {
        const name = btn.dataset.name;
        const price = btn.dataset.price;
        addToCart(name, price); // call your cart.js function
      });
      btn.dataset.bound = "true";
    });
  }

  // Wire on load
  wireButtons();

  // If products are ever injected dynamically, watch for changes
  const observer = new MutationObserver(wireButtons);
  observer.observe(document.body, { childList: true, subtree: true });
  document.querySelectorAll('.details-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.classList.toggle('active');
    const details = btn.nextElementSibling;
    if (details.style.maxHeight) {
      details.style.maxHeight = null;
    } else {
      details.style.maxHeight = details.scrollHeight + "px";
    }
  });
});

});
document.addEventListener('DOMContentLoaded', () => {
  const detectBtn = document.getElementById('detect-loc');
  const locMsg = document.getElementById('loc-msg');
  const addressField = document.getElementById('address');
  const nameField = document.getElementById('name');
  const phoneField = document.getElementById('phone');
  const saveBtn = document.getElementById('save-details');

  const STORAGE_KEY = 'nog_checkout_details_v1';
  let lastCoords = null;

  // Load saved details on page load
  function loadCheckoutDetails() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (!obj) return;
      if (nameField && obj.name) nameField.value = obj.name;
      if (phoneField && obj.phone) phoneField.value = obj.phone;
      if (addressField && obj.address) addressField.value = obj.address;
      if (obj.lat && obj.lon) lastCoords = { lat: obj.lat, lon: obj.lon };
      locMsg.textContent = 'Loaded saved shipping details.';
    } catch (e) {
      console.error('loadCheckoutDetails error', e);
    }
  }

  // Save details to localStorage
  function saveCheckoutDetails(note) {
    try {
      const data = {
        name: nameField?.value?.trim() || '',
        phone: phoneField?.value?.trim() || '',
        address: addressField?.value?.trim() || '',
        lat: lastCoords?.lat || null,
        lon: lastCoords?.lon || null,
        savedAt: Date.now()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      locMsg.textContent = note || '✅ Saved shipping details locally.';
    } catch (e) {
      console.error('saveCheckoutDetails error', e);
      locMsg.textContent = '⚠️ Failed to save details.';
    }
  }

  // Reverse geocode using Nominatim
  async function reverseGeocode(lat, lon) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=18&addressdetails=1`;
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) throw new Error('Reverse geocode failed');
      const data = await res.json();
      if (data && (data.display_name || data.address)) {
        // Prefer display_name
        if (data.display_name) return data.display_name;
        // Build fallback address
        const a = data.address || {};
        return [a.road, a.house_number, a.suburb, a.city, a.state, a.country].filter(Boolean).join(', ');
      }
      throw new Error('No address returned');
    } catch (e) {
      console.warn('reverseGeocode failed', e);
      throw e;
    }
  }

  // IP-based fallback (when geolocation fails/denied)
  async function ipFallback() {
    try {
      locMsg.textContent = '📡 Using IP-based location fallback...';
      // ipapi.co works without key for basic info
      const res = await fetch('https://ipapi.co/json/');
      if (!res.ok) throw new Error('IP lookup failed');
      const d = await res.json();
      const address = [d.city, d.region, d.country_name].filter(Boolean).join(', ');
      if (addressField) addressField.value = address;
      locMsg.textContent = '✅ Filled approximate address from IP.';
      saveCheckoutDetails('Saved approximate address from IP.');
    } catch (e) {
      console.error('ipFallback error', e);
      locMsg.textContent = '⚠️ Could not determine location (try manual input).';
    }
  }

  // Main detect flow
  async function detectLocation() {
    if (!addressField) return;
    if (!navigator.geolocation) {
      locMsg.textContent = '⚠️ Geolocation not supported — using IP fallback...';
      await ipFallback();
      return;
    }

    detectBtn.disabled = true;
    locMsg.textContent = '📍 Detecting location (allow browser permission)...';

    const options = { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 };
    navigator.geolocation.getCurrentPosition(async pos => {
      try {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        lastCoords = { lat, lon };
        locMsg.textContent = '🔎 Reverse-geocoding coordinates...';
        try {
          const addr = await reverseGeocode(lat, lon);
          addressField.value = addr;
          locMsg.textContent = '✅ Location detected and filled.';
          saveCheckoutDetails('✅ Location detected and saved.');
        } catch (e) {
          // reverse failed — still store coords and try IP fallback
          console.warn('reverse failed, trying IP fallback', e);
          await ipFallback();
        }
      } catch (e) {
        console.error('success handler error', e);
        locMsg.textContent = '⚠️ Error processing location.';
      } finally {
        detectBtn.disabled = false;
      }
    }, async err => {
      // error handler
      console.warn('geolocation error', err);
      detectBtn.disabled = false;
      if (err.code === 1) { // PERMISSION_DENIED
        locMsg.textContent = '❌ Permission denied — attempting IP-based fallback...';
        await ipFallback();
      } else if (err.code === 3) { // TIMEOUT
        locMsg.textContent = '⚠️ Location timed out — trying IP fallback...';
        await ipFallback();
      } else {
        locMsg.textContent = '⚠️ Unable to get precise location — using IP fallback...';
        await ipFallback();
      }
    }, options);
  }

  // Wire buttons
  if (detectBtn) detectBtn.addEventListener('click', detectLocation);
  if (saveBtn) saveBtn.addEventListener('click', (e) => { e.preventDefault(); saveCheckoutDetails(); });

  // Load saved details on startup
  loadCheckoutDetails();
});
window.onload = function() {
  let slideIndex = 0;
  let slideTimer;

  function showSlides() {
    const slides = document.getElementsByClassName("slide");
    for (let i = 0; i < slides.length; i++) slides[i].style.display = "none";
    slideIndex++;
    if (slideIndex > slides.length) slideIndex = 1;
    slides[slideIndex - 1].style.display = "block";
    slideTimer = setTimeout(showSlides, 2000); // auto change every 2 seconds
  }

  function changeSlide(n) {
    clearTimeout(slideTimer);       // stop current timer
    slideIndex += n - 1;            // move to correct slide
    showSlides();                   // show immediately and restart timer
  }
};
const chatIcon = document.getElementById('my-chat-icon');
const chatWindow = document.getElementById('my-chat-window');
const chatTitle = document.getElementById('my-chat-title');
const arrowLeft = document.getElementById('my-arrow-left');
const arrowRight = document.getElementById('my-arrow-right');
const chatMessages = document.getElementById('my-chat-messages');
const chatInput = document.getElementById('my-chat-input');
const chatSend = document.getElementById('my-chat-send');

const aiNames = ["ChatGPT", "Gemini", "Grok", "Google AI", "Claude", "Perplexity"];
let currentIndex = 0;

// Open/close chat window
chatIcon.addEventListener('click', () => {
  chatWindow.style.display = chatWindow.style.display === 'flex' ? 'none' : 'flex';
});

// Cycle AI names
arrowLeft.addEventListener('click', () => {
  currentIndex = (currentIndex - 1 + aiNames.length) % aiNames.length;
  chatTitle.textContent = aiNames[currentIndex];
});

arrowRight.addEventListener('click', () => {
  currentIndex = (currentIndex + 1) % aiNames.length;
  chatTitle.textContent = aiNames[currentIndex];
});

// Send message
chatSend.addEventListener('click', async () => {
  const userMessage = chatInput.value.trim();
  if(!userMessage) return;

  // Display user message
  chatMessages.innerHTML += `<div><b>You:</b> ${userMessage}</div>`;
  chatInput.value = "";

  // Send to your backend (replace /api/chat with your endpoint)
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        aiProvider: aiNames[currentIndex],
        userMessage
      }),
    });

    const data = await response.json();
    const reply = data.reply || "Sorry, no response yet.";

    // Display AI reply
    chatMessages.innerHTML += `<div><b>${aiNames[currentIndex]}:</b> ${reply}</div>`;
    chatMessages.scrollTop = chatMessages.scrollHeight;
  } catch (err) {
    chatMessages.innerHTML += `<div style="color:red;"><b>Error:</b> Could not get reply</div>`;
    console.error(err);
  }
});

function showAddToCartMessage() {
  const msg = document.getElementById('addToCartMessage');
  msg.style.display = 'flex';
}

function continueShopping() {
  document.getElementById('addToCartMessage').style.display = 'none';
}

function goToCart() {
  window.location.href = 'cart.html';
}
