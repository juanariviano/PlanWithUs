const bar = document.getElementById("bar");
const close = document.getElementById("close");
const nav = document.getElementById("navbar");

if (bar) {
  bar.addEventListener("click", () => {
    nav.classList.add("active");
  });
}

if (close) {
  close.addEventListener("click", () => {
    nav.classList.remove("active");
  });
}

// Donation handling
let currentEventId = null;

function openModal(eventId) {
  currentEventId = eventId;
  document.getElementById("donationModal").style.display = "block";
  // Reset donation amount when opening modal
  document.getElementById("donationAmount").value = "";
}

function closeModal() {
  document.getElementById("donationModal").style.display = "none";
}

async function confirmDonation() {
  const donationAmount = parseInt(document.getElementById("donationAmount").value);
  const paymentMethod = document.getElementById("paymentMethod").value;
  
  if (!donationAmount || donationAmount < 1) {
    alert("Please enter a valid amount!");
    return;
  }

  try {
    const response = await fetch("/donate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ 
        eventId: currentEventId, 
        donationAmount: donationAmount 
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.success) {
      // Update the raised amount display
      const raisedAmountElement = document.querySelector(`[data-event-id="${currentEventId}"] .raised-amount`);
      if (raisedAmountElement) {
        raisedAmountElement.textContent = data.raised_money;
      }

      // Update progress bar
      const progressBar = document.querySelector(`[data-event-id="${currentEventId}"] .progress-bar`);
      if (progressBar) {
        const goalAmount = parseInt(document.querySelector(`[data-event-id="${currentEventId}"] .goal-amount`).textContent);
        const progress = (data.raised_money / goalAmount) * 100;
        progressBar.style.width = `${Math.min(progress, 100)}%`;
      }

      alert("Thank you for your donation!");
      closeModal();

      // Check if target reached and reload if needed
      const goalAmount = parseInt(document.querySelector(`[data-event-id="${currentEventId}"] .goal-amount`).textContent);
      if (data.raised_money >= goalAmount) {
        setTimeout(() => {
          location.reload();
        }, 1500);
      }
    } else {
      throw new Error(data.message || "Failed to process donation");
    }
  } catch (err) {
    console.error("Donation error:", err);
    alert("An error occurred while processing your donation. Please try again.");
  }
}