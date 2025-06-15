
async function loadVolunteers() {
    const eventId = document.getElementById('eventSelector').value;
    const volunteerContainer = document.getElementById('volunteer-applications');
    
    if (!eventId) {
      volunteerContainer.innerHTML = '<p class="select-message">please select an event to view volunteer applications</p>';
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
        
        volunteerContainer.innerHTML = '';
        
        if (data.volunteers.length === 0) {
          volunteerContainer.innerHTML = '<p class="no-volunteers">no volunteer applications found for this event</p>';
          return;
        }
        
        
        const template = document.getElementById('volunteer-card-template');
        
       
        data.volunteers.forEach(volunteer => {
          const volunteerCard = document.importNode(template.content, true);
          
         
          volunteerCard.querySelector('.volunteer-name').textContent = volunteer.name;
          volunteerCard.querySelector('.volunteer-email').textContent = `Email: ${volunteer.email}`;
          volunteerCard.querySelector('.volunteer-phone').textContent = `Phone: ${volunteer.phone}`;
          volunteerCard.querySelector('.volunteer-message').textContent = `Message: ${volunteer.message}`;
          volunteerCard.querySelector('.application-date').textContent = `Applied: ${new Date(volunteer.created_at).toLocaleDateString()}`;
          volunteerCard.querySelector('.status').textContent = `Status: ${volunteer.status.charAt(0).toUpperCase() + volunteer.status.slice(1)}`;
          
          
          const card = volunteerCard.querySelector('.volunteer-card');
          card.setAttribute('data-volunteer-id', volunteer.id);
          card.setAttribute('data-status', volunteer.status);
          
          
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
        volunteerContainer.innerHTML = `<p class="error">${data.message || 'failed to load volunteer applications'}</p>`;
      }
    } catch (error) {
      console.error('error loading volunteers:', error);
      volunteerContainer.innerHTML = '<p class="error">failed to load volunteer applications</p>';
    }
  }
  
  
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
        
        volunteerCard.querySelector('.status').textContent = `status: ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}`;
        volunteerCard.setAttribute('data-status', newStatus);
        
        
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
        
       
        alert(`volunteer status updated to ${newStatus}`);
      } else {
        alert(data.message || 'failed to update volunteer status');
      }
    } catch (error) {
      console.error('error updating volunteer status:', error);
      alert('failed to update volunteer status');
    }
  }
  

  document.addEventListener('DOMContentLoaded', function() {
    const eventSelector = document.getElementById('eventSelector');
    if (eventSelector.value) {
      loadVolunteers();
    }
  });