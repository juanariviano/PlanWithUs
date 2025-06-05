const bar = document.getElementById("bar");
const nav = document.getElementById("navbar");
const closeBtn = document.getElementById("close");
const profileBtn = document.getElementById("profileBtn");
const dropdownContent = document.querySelector(
  ".profile-dropdown .dropdown-content"
);

if (bar) {
  bar.addEventListener("click", () => {
    nav.classList.add("active");
  });
}

if (closeBtn) {
  closeBtn.addEventListener("click", () => {
    nav.classList.remove("active");
  });
}

if (profileBtn && dropdownContent) {
  profileBtn.addEventListener("click", (event) => {
    event.preventDefault();
    if (window.innerWidth <= 769) {
      dropdownContent.classList.toggle("open");
    }
  });
}

nav.querySelectorAll("a:not(#profileBtn)").forEach((link) => {
  link.addEventListener("click", (event) => {
    const isInsideDropdown = link.closest(".dropdown-content");

    if (nav.classList.contains("active")) {
      if (
        !isInsideDropdown ||
        (isInsideDropdown && dropdownContent.classList.contains("open"))
      ) {
        nav.classList.remove("active");
        dropdownContent.classList.remove("open");
      }
    }
  });
});

document.addEventListener("click", function (event) {
  const profileDropdown = document.querySelector(".profile-dropdown");
  if (profileDropdown && !profileDropdown.contains(event.target)) {
    if (dropdownContent.classList.contains("open")) {
      dropdownContent.classList.remove("open");
    }
  }
});
