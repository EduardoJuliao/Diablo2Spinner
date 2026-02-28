// OBS overlay mode: use ?obs for transparent background
if (new URLSearchParams(window.location.search).has('obs')) {
    document.body.classList.add('obs-mode');
}

const socket = io();

// ── Canvas setup ─────────────────────────────────────────────
const canvas = document.getElementById('wheelCanvas');
const ctx = canvas.getContext('2d');
const centerX = canvas.width / 2;
const centerY = canvas.height / 2;
const radius = 280;

// ── Wheel segments ───────────────────────────────────────────
const K  = { text: 'Keep Char',    color: '#9b59b6' };
const KS = { text: 'Keep Shared',  color: '#007bff' };
const D  = { text: 'DROP',         color: '#dc3545' };

const segments = [
    K, KS, K, KS, K, KS, K, KS, K, KS,  // 0-9
    K, KS, K, KS, K, KS, K, KS, K, KS,  // 10-19
    D,                                    // 20 - DROP
    K, KS, K, KS, K, KS, K, KS, K, KS,  // 21-30
    K, KS, K, KS, K, KS, K, KS, K,       // 31-39
];

const anglePerSegment = (2 * Math.PI) / segments.length;

let currentRotation = 0;
let isSpinning = false;
let spinQueue = [];

// ── Round state ──────────────────────────────────────────────
let roundActive = false;
let timerInterval = null;
let timeRemaining = 120;
let pendingRoundEnd = null; // 'timeout' — set when timer fires mid-spin

function startRound() {
    resetRoundBits();
    updateDonorTable();
    roundActive = true;
    timeRemaining = 120;
    updateTimerDisplay();
    timerInterval = setInterval(() => {
        timeRemaining--;
        updateTimerDisplay();
        if (timeRemaining <= 0) endRound('timeout');
    }, 1000);
}

function endRound(reason) {
    clearInterval(timerInterval);
    timerInterval = null;
    roundActive = false;
    updateTimerDisplay();

    // If a spin is still in progress, defer the overlay until it finishes
    if (reason === 'timeout' && isSpinning) {
        pendingRoundEnd = 'timeout';
        return;
    }

    showRoundResult(reason);
}

function showRoundResult(reason) {
    if (reason === 'timeout') {
        showOverlay("TIME'S UP!\nYOU WIN! Keep it!", 'win', 8000);
    } else {
        showOverlay('ROUND OVER\nDROP IT!', 'drop', 8000);
    }
    setTimeout(() => {
        document.getElementById('currentDonor').textContent = '';
    }, 8000);
}

function updateTimerDisplay() {
    const el = document.getElementById('timer');
    if (!roundActive) {
        el.textContent = '';
        el.className = 'timer';
        return;
    }
    const mins = Math.floor(timeRemaining / 60);
    const secs = timeRemaining % 60;
    el.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    el.className = timeRemaining <= 30 ? 'timer danger' : 'timer';
}

// ── Overlay ──────────────────────────────────────────────────
let overlayTimeout = null;

function showOverlay(text, type, duration = 3500) {
    const overlay = document.getElementById('resultOverlay');
    overlay.innerHTML = text.replace('\n', '<br>');
    overlay.className = `result-overlay ${type}`;
    clearTimeout(overlayTimeout);
    overlayTimeout = setTimeout(() => {
        overlay.className = 'result-overlay hidden';
    }, duration);
}

// ── Donor tracking ───────────────────────────────────────────
// Persists all-time totals in localStorage; round bits reset each round
let donors = {};

function loadDonors() {
    try {
        const saved = localStorage.getItem('d2wheel_donors');
        if (saved) {
            const totals = JSON.parse(saved);
            for (const [name, totalBits] of Object.entries(totals)) {
                donors[name] = { roundBits: 0, totalBits };
            }
        }
    } catch (e) {}
}

function saveDonors() {
    try {
        const totals = {};
        for (const [name, data] of Object.entries(donors)) {
            totals[name] = data.totalBits;
        }
        localStorage.setItem('d2wheel_donors', JSON.stringify(totals));
    } catch (e) {}
}

function addDonation(name, bits) {
    if (!donors[name]) donors[name] = { roundBits: 0, totalBits: 0 };
    donors[name].roundBits += bits;
    donors[name].totalBits += bits;
    saveDonors();
    updateDonorTable();
}

function resetRoundBits() {
    for (const name of Object.keys(donors)) {
        donors[name].roundBits = 0;
    }
}

function updateDonorTable() {
    const tbody = document.getElementById('donorTableBody');
    const rows = Object.entries(donors)
        .filter(([, d]) => d.totalBits > 0)
        .sort(([, a], [, b]) => b.roundBits - a.roundBits || b.totalBits - a.totalBits)
        .map(([name, data]) => `
            <tr>
                <td>${name}</td>
                <td>${data.roundBits > 0 ? data.roundBits.toLocaleString() : '-'}</td>
                <td>${data.totalBits.toLocaleString()}</td>
            </tr>`)
        .join('');
    tbody.innerHTML = rows || '<tr><td colspan="3" style="color:#666;text-align:center">Waiting for donations...</td></tr>';
}

// ── Wheel drawing ────────────────────────────────────────────
function drawWheel() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    segments.forEach((segment, index) => {
        const startAngle = currentRotation + (index * anglePerSegment);
        const endAngle = startAngle + anglePerSegment;

        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.lineTo(centerX, centerY);
        ctx.fillStyle = segment.color;
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(startAngle + anglePerSegment / 2);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px Arial';
        ctx.fillText(segment.text, radius * 0.65, 0);
        ctx.restore();
    });

    // Center circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, 30, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffd700';
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.stroke();
}

function getWinningSegment() {
    const pointerAngle = (3 * Math.PI) / 2;
    const normalizedRotation = (currentRotation % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const adjustedAngle = (pointerAngle - normalizedRotation + 2 * Math.PI) % (2 * Math.PI);
    return segments[Math.floor(adjustedAngle / anglePerSegment)];
}

// ── Spin ─────────────────────────────────────────────────────
function spinWheel(duration = 5000) {
    if (isSpinning) return;
    isSpinning = true;

    const startTime = Date.now();
    const startRotation = currentRotation;
    const totalRotation = (5 + Math.random() * 3) * 2 * Math.PI;

    function animate() {
        const progress = Math.min((Date.now() - startTime) / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        currentRotation = startRotation + totalRotation * easeOut;
        drawWheel();

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            isSpinning = false;
            const result = getWinningSegment();
            socket.emit('spinComplete', { result: result.text });

            if (result.text === 'DROP') {
                pendingRoundEnd = null;
                endRound('drop');
            } else if (pendingRoundEnd === 'timeout') {
                // Timer fired while this spin was running — show win now
                pendingRoundEnd = null;
                showRoundResult('timeout');
            } else {
                // Normal spin result — show overlay then continue queue
                showOverlay(result.text, result.text === 'Keep Char' ? 'keep' : 'share', 1800);
                setTimeout(() => {
                    if (roundActive && spinQueue.length > 0) {
                        spinQueue.shift();
                        updateSpinQueue();
                        spinWheel();
                    } else {
                        document.getElementById('currentDonor').textContent = '';
                    }
                }, 2000);
            }
        }
    }

    animate();
}

function updateSpinQueue() {
    const el = document.getElementById('spinQueue');
    el.textContent = spinQueue.length > 0 ? `Spins in queue: ${spinQueue.length}` : '';
    try {
        localStorage.setItem('d2wheel_queue', JSON.stringify(spinQueue));
    } catch (e) {}
}

function loadQueue() {
    try {
        const saved = localStorage.getItem('d2wheel_queue');
        if (saved) spinQueue = JSON.parse(saved);
    } catch (e) {}
}

// ── Socket events ────────────────────────────────────────────
socket.on('connect', () => console.log('✅ Connected to server'));

socket.on('startRound', () => {
    if (roundActive || isSpinning) return;
    if (spinQueue.length === 0) {
        console.log('⚠️ Start round triggered but queue is empty');
        return;
    }
    console.log('🎡 Manual round start — spinning queue');
    startRound();
    spinQueue.shift();
    updateSpinQueue();
    spinWheel();
});

socket.on('newSpin', (data) => {
    console.log('🎲 New spin:', data);

    for (let i = 0; i < data.spins; i++) spinQueue.push(data);

    document.getElementById('currentDonor').textContent =
        `${data.donor} donated ${data.bits} bits! (${data.spins} spin${data.spins > 1 ? 's' : ''})`;

    // Start round BEFORE addDonation so resetRoundBits runs first
    if (!isSpinning && !roundActive) startRound();

    addDonation(data.donor, data.bits);
    updateSpinQueue();

    if (!isSpinning) {
        spinQueue.shift();
        updateSpinQueue();
        spinWheel();
    }
});

// ── Manual round start ───────────────────────────────────────
function startRoundManual() {
    fetch('/api/start-round', { method: 'POST' })
        .then(r => r.json())
        .then(data => console.log('Round start triggered:', data))
        .catch(err => console.error('Error:', err));
}

// ── Test spin ────────────────────────────────────────────────
function testSpin() {
    const donor = document.getElementById('testDonor').value || 'TestViewer';
    const bits = parseInt(document.getElementById('testBits').value) || 100;
    fetch('/api/test-spin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ donor, bits })
    })
    .then(r => r.json())
    .then(data => console.log('Test spin sent:', data))
    .catch(err => console.error('Error:', err));
}

// ── Init ─────────────────────────────────────────────────────
loadDonors();
loadQueue();
updateDonorTable();
updateSpinQueue();
drawWheel();
