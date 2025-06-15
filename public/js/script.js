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




let currentEventId = null;


function openModal(eventId) {
  currentEventId = eventId;
  const donationModal = document.getElementById('donationModal');
  donationModal.setAttribute('data-event-id', eventId);
  donationModal.style.display = 'block';
}

function closeModal() {
  document.getElementById('donationModal').style.display = 'none';
  
  document.getElementById('donationAmount').value = '';
}

function confirmDonation() {
  const eventId = document.getElementById('donationModal').getAttribute('data-event-id');
  const amount = document.getElementById('donationAmount').value;
  const paymentMethod = document.getElementById('paymentMethod').value;
  
  if (!amount || amount <= 0) {
    alert('Please enter a valid donation amount');
    return;
  }
  
  
  fetch('/donate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      eventId: eventId,
      donationAmount: amount,
      paymentMethod: paymentMethod
    }),
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      
      const container = document.querySelector(`.container-1[data-event-id="${eventId}"]`);
      if (container) {
        const raisedElement = container.querySelector('.raised-amount');
        if (raisedElement) {
          raisedElement.textContent = data.raised_money;
          
         
          const goalAmount = parseFloat(container.querySelector('.goal-amount').textContent);
          const progressBar = container.querySelector('.progress-bar');
          if (progressBar) {
            progressBar.style.width = `${(data.raised_money / goalAmount) * 100}%`;
          }
        }
      }
      
      
      closeModal();
      alert('Thank you for your donation!');
    } else {
      alert('Error: ' + data.message);
    }
  })
  .catch(error => {
    console.error('Error:', error);
    alert('An error occurred while processing your donation');
  });
}


window.onclick = function(event) {
  const modal = document.getElementById('donationModal');
  if (event.target == modal) {
    closeModal();
  }
  
  const volunteerModal = document.getElementById('volunteerModal');
  if (event.target == volunteerModal) {
    closeVolunteerModal();
  }
};


document.getElementById('volunteer_needed').addEventListener('change', function() {
  const volunteerDetails = document.getElementById('volunteer-details');
  volunteerDetails.style.display = this.checked ? 'block' : 'none';
  
  if (!this.checked) {
    document.getElementById('volunteer_description').value = '';
    document.getElementById('max_volunteers').value = '1';
  }
});




document.addEventListener('DOMContentLoaded', function() {
  
  document.querySelectorAll('[id^="volunteer-btn-"]').forEach(btn => {
    const eventId = btn.dataset.eventId;
    updateVolunteerCountDisplay(eventId);
    checkUserVolunteerStatus(eventId);
  });
});

let volunteerEventId = null;

function openVolunteerModal(eventId) {
  volunteerEventId = eventId;
  document.getElementById('volunteerEventId').value = eventId;
  
  
  <% if (user) { %>
    document.getElementById('volunteerName').value = "<%= user.name %>";
    document.getElementById('volunteerEmail').value = "<%= user.email %>";
  <% } %>
  
  document.getElementById('volunteerModal').style.display = 'block';
}

function closeVolunteerModal() {
  document.getElementById('volunteerModal').style.display = 'none';
  document.getElementById('volunteerForm').reset();
}


document.addEventListener("DOMContentLoaded", function () {
  const volunteerCountElements = document.querySelectorAll(
    '[id^="volunteer-count-"]'
  );

  volunteerCountElements.forEach((element) => {
    const eventId = element.id.split("-").pop();

    
    fetch(`/volunteer-count/${eventId}`)
      .then((response) => response.json())
      .then((data) => {
        
        element.textContent = data.currentCount || 0;

        
        if (data.isFull) {
          const btn = document.getElementById(`volunteer-btn-${eventId}`);
          if (btn) {
            btn.disabled = true;
            btn.textContent = "Positions Filled";
          }
        }
      })
      .catch((error) => {
        console.error("Error fetching volunteer count:", error);
        element.textContent = "Error";
      });
  });
});

async function submitVolunteerApplication() {
  const formData = {
    eventId: document.getElementById('volunteerEventId').value,
    name: document.getElementById('volunteerName').value,
    email: document.getElementById('volunteerEmail').value,
    phone: document.getElementById('volunteerPhone').value,
    message: document.getElementById('volunteerMessage').value
  };

  try {
    const response = await fetch('/volunteer/apply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify(formData)
    });

    const data = await response.json();

    if (data.success) {
      alert('Your volunteer application has been submitted!');
      closeVolunteerModal();
      
      
      updateVolunteerCountDisplay(formData.eventId);
      
      
      const btn = document.getElementById(`volunteer-btn-${formData.eventId}`);
      btn.textContent = 'Application Submitted';
      btn.disabled = true;
      btn.classList.add('volunteer-applied');
    } else {
      alert(data.message || 'Something went wrong. Please try again.');
    }
  } catch (err) {
    console.error('Volunteer application error:', err);
    alert('An error occurred while submitting your application.');
  }
}


function updateVolunteerCount(eventId) {
  const countElement = document.getElementById(`volunteer-count-${eventId}`);
  if (!countElement) return;
  
  fetch(`/volunteer/count/${eventId}`)
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    })
    .then(data => {
      
      countElement.textContent = data.currentCount || 0;
      
      
      if (data.isFull) {
        const btn = document.getElementById(`volunteer-btn-${eventId}`);
        if (btn) {
          btn.disabled = true;
          btn.textContent = 'Positions Filled';
          btn.classList.add('volunteer-full');
        }
      }
    })
    .catch(error => {
      console.error('Error fetching volunteer count:', error);
      countElement.textContent = "Error";
    });
}


document.addEventListener('DOMContentLoaded', function() {
  
  const eventElements = document.querySelectorAll('[data-event-id]');
  eventElements.forEach(element => {
    const eventId = element.getAttribute('data-event-id');
    updateVolunteerCount(eventId);
  });
});

async function updateVolunteerCountDisplay(eventId) {
  try {
    const response = await fetch(`/volunteer/count/${eventId}`, {
      credentials: 'same-origin'
    });
    
    const data = await response.json();
    
    const countElement = document.getElementById(`volunteer-count-${eventId}`);
    if (countElement) {
      countElement.textContent = data.currentCount;
    }
    
    
    if (data.isFull) {
      const btn = document.getElementById(`volunteer-btn-${eventId}`);
      if (btn) {
        btn.textContent = 'Positions Filled';
        btn.disabled = true;
        btn.classList.add('volunteer-full');
      }
    }
  } catch (err) {
    console.error('Error getting volunteer count:', err);
  }
}

async function checkUserVolunteerStatus(eventId) {
  try {
    const response = await fetch(`/volunteer/status/${eventId}`, {
      credentials: 'same-origin'
    });
    
    const data = await response.json();
    
    if (data.hasApplied) {
      const btn = document.getElementById(`volunteer-btn-${eventId}`);
      if (btn) {
        btn.textContent = data.status === 'pending' ? 'Application Submitted' : 
                         (data.status === 'approved' ? 'Application Approved' : 'Application ' + data.status);
        btn.disabled = true;
        btn.classList.add(`volunteer-${data.status}`);
      }
    }
  } catch (err) {
    console.error('Error checking volunteer status:', err);
  }
}


function openTab(evt, tabName) {
  
  const tabContents = document.getElementsByClassName("tab-content");
  for (let i = 0; i < tabContents.length; i++) {
    tabContents[i].classList.remove("active");
  }
  
 
  const tabButtons = document.getElementsByClassName("tab-button");
  for (let i = 0; i < tabButtons.length; i++) {
    tabButtons[i].classList.remove("active");
  }
  
  
  document.getElementById(tabName).classList.add("active");
  evt.currentTarget.classList.add("active");
}

