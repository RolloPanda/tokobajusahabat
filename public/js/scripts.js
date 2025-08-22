/*!
* Start Bootstrap - Shop Homepage v5.0.6 (https://startbootstrap.com/template/shop-homepage)
* Copyright 2013-2023 Start Bootstrap
* Licensed under MIT (https://github.com/StartBootstrap/startbootstrap-shop-homepage/blob/master/LICENSE)
*/
// This file is intentionally blank
// Use this file to add JavaScript to your project
document.addEventListener('DOMContentLoaded', function () {
    var dropdownSubmenus = document.querySelectorAll('.dropdown-submenu > a');
  
    dropdownSubmenus.forEach(function (submenuToggle) {
      submenuToggle.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var submenu = submenuToggle.nextElementSibling;
        if (submenu.style.display === 'block') {
          submenu.style.display = 'none';
        } else {
          // Hide any other open submenus
          document.querySelectorAll('.dropdown-submenu .dropdown-menu').forEach(function (menu) {
            menu.style.display = 'none';
          });
          submenu.style.display = 'block';
        }
      });

      // Add hover behavior
      var parentLi = submenuToggle.parentElement;
      parentLi.addEventListener('mouseenter', function () {
        var submenu = submenuToggle.nextElementSibling;
        submenu.style.display = 'block';
      });
      parentLi.addEventListener('mouseleave', function () {
        var submenu = submenuToggle.nextElementSibling;
        submenu.style.display = 'none';
      });
    });
  
    // Close submenu when clicking outside
    document.addEventListener('click', function () {
      document.querySelectorAll('.dropdown-submenu .dropdown-menu').forEach(function (menu) {
        menu.style.display = 'none';
      });
    });
  });
