// Fungsi untuk memuat data volunteer berdasarkan event ID
async function loadVolunteers() {
    const eventId = document.getElementById('eventSelector').value;
    const volunteerContainer = document.getElementById('volunteer-applications');
    
    if (!eventId) {
      volunteerContainer.innerHTML = '<p class="select-message">Please select an event to view volunteer applications</p>';
      return;
    }
    
    try {
      const response = await fetch(`/api/volunteers/${eventId}`, {
        method: 'GET',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Clear container
        volunteerContainer.innerHTML = '';
        
        if (data.volunteers.length === 0) {
          volunteerContainer.innerHTML = '<p class="no-volunteers">No volunteer applications found for this event</p>';
          return;
        }
        
        // Get template
        const template = document.getElementById('volunteer-card-template');
        
        // Clone and populate template for each volunteer
        data.volunteers.forEach(volunteer => {
          const volunteerCard = document.importNode(template.content, true);
          
          // Fill in volunteer data
          volunteerCard.querySelector('.volunteer-name').textContent = volunteer.name;
          volunteerCard.querySelector('.volunteer-email').textContent = `Email: ${volunteer.email}`;
          volunteerCard.querySelector('.volunteer-phone').textContent = `Phone: ${volunteer.phone}`;
          volunteerCard.querySelector('.volunteer-message').textContent = `Message: ${volunteer.message}`;
          volunteerCard.querySelector('.application-date').textContent = `Applied: ${new Date(volunteer.created_at).toLocaleDateString()}`;
          volunteerCard.querySelector('.status').textContent = `Status: ${volunteer.status.charAt(0).toUpperCase() + volunteer.status.slice(1)}`;
          
          // Set data attribute for volunteer ID
          const card = volunteerCard.querySelector('.volunteer-card');
          card.setAttribute('data-volunteer-id', volunteer.id);
          card.setAttribute('data-status', volunteer.status);
          
          // Show/hide buttons based on current status
          const approveBtn = volunteerCard.querySelector('.approve-btn');
          const rejectBtn = volunteerCard.querySelector('.reject-btn');
          const completeBtn = volunteerCard.querySelector('.complete-btn');
          
          if (volunteer.status === 'pending') {
            approveBtn.style.display = 'block';
            rejectBtn.style.display = 'block';
            completeBtn.style.display = 'none';
          } else if (volunteer.status === 'approved') {
            approveBtn.style.display = 'none';
            rejectBtn.style.display = 'block';
            completeBtn.style.display = 'block';
          } else {
            approveBtn.style.display = 'none';
            rejectBtn.style.display = 'none';
            completeBtn.style.display = 'none';
          }
          
          volunteerContainer.appendChild(volunteerCard);
        });
      } else {
        volunteerContainer.innerHTML = `<p class="error">${data.message || 'Failed to load volunteer applications'}</p>`;
      }
    } catch (error) {
      console.error('Error loading volunteers:', error);
      volunteerContainer.innerHTML = '<p class="error">Failed to load volunteer applications</p>';
    }
  }
  
  // Fungsi untuk memperbarui status volunteer
  async function updateVolunteerStatus(button, newStatus) {
    const volunteerCard = button.closest('.volunteer-card');
    const volunteerId = volunteerCard.getAttribute('data-volunteer-id');
    const eventId = document.getElementById('eventSelector').value;
    
    try {
      const response = await fetch('/api/volunteer/update-status', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          volunteerId: volunteerId,
          eventId: eventId,
          status: newStatus
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Update status in UI
        volunteerCard.querySelector('.status').textContent = `Status: ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}`;
        volunteerCard.setAttribute('data-status', newStatus);
        
        // Update button visibility
        const approveBtn = volunteerCard.querySelector('.approve-btn');
        const rejectBtn = volunteerCard.querySelector('.reject-btn');
        const completeBtn = volunteerCard.querySelector('.complete-btn');
        
        if (newStatus === 'pending') {
          approveBtn.style.display = 'block';
          rejectBtn.style.display = 'block';
          completeBtn.style.display = 'none';
        } else if (newStatus === 'approved') {
          approveBtn.style.display = 'none';
          rejectBtn.style.display = 'block';
          completeBtn.style.display = 'block';
        } else {
          approveBtn.style.display = 'none';
          rejectBtn.style.display = 'none';
          completeBtn.style.display = 'none';
        }
        
        // Show success message
        alert(`Volunteer status updated to ${newStatus}`);
      } else {
        alert(data.message || 'Failed to update volunteer status');
      }
    } catch (error) {
      console.error('Error updating volunteer status:', error);
      alert('Failed to update volunteer status');
    }
  }
  
  // Load volunteers when the page loads (if event is selected)
  document.addEventListener('DOMContentLoaded', function() {
    const eventSelector = document.getElementById('eventSelector');
    if (eventSelector.value) {
      loadVolunteers();
    }
  });