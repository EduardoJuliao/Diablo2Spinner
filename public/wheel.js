// OBS overlay mode: use http://localhost:3000?obs for transparent background
if (new URLSearchParams(window.location.search).has('obs')) {
    document.body.classList.add('obs-mode');
}

// Socket.io connection
const socket = io();

// Canvas setup
const canvas = document.getElementById('wheelCanvas');
const ctx = canvas.getContext('2d');
const centerX = canvas.width / 2;
const centerY = canvas.height / 2;
const radius = 280;

// Wheel configuration - 40 segments
// Interleaved: Keep/Keep-Share alternating, DROP in the middle (position 20)
const K  = { text: 'Keep',        color: '#28a745' };
const KS = { text: 'Keep - Share', color: '#007bff' };
const D  = { text: 'DROP',         color: '#dc3545' };

const segments = [
    K, KS, K, KS, K, KS, K, KS, K, KS,  // 0-9
    K, KS, K, KS, K, KS, K, KS, K, KS,  // 10-19
    D,                                    // 20 - DROP
    K, KS, K, KS, K, KS, K, KS, K, KS,  // 21-30
    K, KS, K, KS, K, KS, K, KS, K,       // 31-39
];

const totalSegments = segments.length;
const anglePerSegment = (2 * Math.PI) / totalSegments;

let currentRotation = 0;
let isSpinning = false;
let spinQueue = [];

// Round state
let roundActive = false;
let timerInterval = null;
let timeRemaining = 120;

function startRound() {
    roundActive = true;
    timeRemaining = 120;
    updateTimerDisplay();
    timerInterval = setInterval(() => {
        timeRemaining--;
        updateTimerDisplay();
        if (timeRemaining <= 0) {
            endRound('timeout');
        }
    }, 1000);
}

function endRound(reason) {
    clearInterval(timerInterval);
    timerInterval = null;
    roundActive = false;
    updateTimerDisplay();

    const roundResultEl = document.getElementById('roundResult');
    if (reason === 'timeout') {
        roundResultEl.textContent = 'TIME\'S UP! YOU WIN! Keep the item!';
        roundResultEl.className = 'round-result win';
    } else {
        roundResultEl.textContent = 'ROUND OVER — DROP IT!';
        roundResultEl.className = 'round-result drop';
    }

    setTimeout(() => {
        roundResultEl.textContent = '';
        roundResultEl.className = 'round-result';
        document.getElementById('currentDonor').textContent = '';
    }, 6000);
}

function updateTimerDisplay() {
    const timerEl = document.getElementById('timer');
    if (!roundActive) {
        timerEl.textContent = '';
        timerEl.className = 'timer';
        return;
    }
    const mins = Math.floor(timeRemaining / 60);
    const secs = timeRemaining % 60;
    timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    timerEl.className = timeRemaining <= 30 ? 'timer danger' : 'timer';
}

// Draw the wheel
function drawWheel() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    segments.forEach((segment, index) => {
        const startAngle = currentRotation + (index * anglePerSegment);
        const endAngle = startAngle + anglePerSegment;

        // Draw segment
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.lineTo(centerX, centerY);
        ctx.fillStyle = segment.color;
        ctx.fill();

        // Draw border
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw text
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(startAngle + anglePerSegment / 2);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px Arial';
        ctx.fillText(segment.text, radius * 0.65, 0);
        ctx.restore();
    });

    // Draw center circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, 30, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffd700';
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.stroke();
}

// Get the segment at the top (where pointer is)
function getWinningSegment() {
    // The pointer is at the top (12 o'clock position)
    // We need to find which segment is at 3π/2 (270 degrees, top of circle)
    const pointerAngle = (3 * Math.PI) / 2;
    let normalizedRotation = (currentRotation % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    let adjustedAngle = (pointerAngle - normalizedRotation + 2 * Math.PI) % (2 * Math.PI);
    const segmentIndex = Math.floor(adjustedAngle / anglePerSegment);
    return segments[segmentIndex];
}

// Spin the wheel
function spinWheel(duration = 5000) {
    if (isSpinning) return;

    isSpinning = true;
    const startTime = Date.now();
    const startRotation = currentRotation;

    // Random final rotation (at least 5 full spins)
    const minSpins = 5;
    const maxSpins = 8;
    const spins = minSpins + Math.random() * (maxSpins - minSpins);
    const totalRotation = spins * 2 * Math.PI;

    function animate() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Easing function (ease-out)
        const easeOut = 1 - Math.pow(1 - progress, 3);

        currentRotation = startRotation + totalRotation * easeOut;
        drawWheel();

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            isSpinning = false;
            const result = getWinningSegment();
            displayResult(result);
            socket.emit('spinComplete', { result: result.text });

            if (result.text === 'DROP') {
                // Stop the round — queue is preserved for next round
                endRound('drop');
            } else {
                setTimeout(() => {
                    if (roundActive && spinQueue.length > 0) {
                        // Round still running, more spins queued
                        spinQueue.shift();
                        updateSpinQueue();
                        spinWheel();
                    } else {
                        // Either timer expired or queue is empty — stop here
                        document.getElementById('currentDonor').textContent = '';
                    }
                }, 3000);
            }
        }
    }

    animate();
}

// Display result
function displayResult(segment) {
    const resultDiv = document.getElementById('result');
    resultDiv.textContent = segment.text;
    resultDiv.className = 'result-display';

    if (segment.text === 'Keep') {
        resultDiv.classList.add('keep');
    } else if (segment.text === 'Keep - Share') {
        resultDiv.classList.add('share');
    } else if (segment.text === 'DROP') {
        resultDiv.classList.add('drop');
    }

    setTimeout(() => {
        resultDiv.textContent = '';
        resultDiv.className = 'result-display';
    }, 5000);
}

// Update spin queue display
function updateSpinQueue() {
    const queueDiv = document.getElementById('spinQueue');
    if (spinQueue.length > 0) {
        queueDiv.textContent = `Spins remaining: ${spinQueue.length}`;
    } else {
        queueDiv.textContent = '';
    }
}

// Socket event listeners
socket.on('connect', () => {
    console.log('✅ Connected to server');
});

socket.on('newSpin', (data) => {
    console.log('🎲 New spin request:', data);

    for (let i = 0; i < data.spins; i++) {
        spinQueue.push(data);
    }

    document.getElementById('currentDonor').textContent =
        `${data.donor} donated ${data.bits} bits! ${data.spins} spin(s)`;

    updateSpinQueue();

    if (!isSpinning) {
        // Start a new round only if one isn't already running
        if (!roundActive) {
            startRound();
        }
        spinQueue.shift();
        updateSpinQueue();
        spinWheel();
    }
});

// Test spin function
function testSpin() {
    const donor = document.getElementById('testDonor').value || 'TestViewer';
    const bits = parseInt(document.getElementById('testBits').value) || 100;

    fetch('/api/test-spin', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ donor, bits })
    })
    .then(response => response.json())
    .then(data => console.log('Test spin sent:', data))
    .catch(error => console.error('Error:', error));
}

// Initial draw
drawWheel();
