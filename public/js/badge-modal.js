var badgeModal = document.getElementById("badgeModal");

var badgeBtn = document.getElementById("badgeBtn");

var badgeSpan = document.getElementsByClassName("badge-close")[0];

badgeBtn.onclick = function() {
  badgeModal.style.display = "block";
}

badgeSpan.onclick = function() {
  badgeModal.style.display = "none";
}

window.onclick = function(event) {
  if (event.target == badgeModal) {
    badgeModal.style.display = "none";
  }
}