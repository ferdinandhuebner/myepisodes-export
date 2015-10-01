"use strict";

var request = require('request');
var deferred = require('deferred');
var jsdom = require("jsdom");

var cookieJar = request.jar();

var login = function(user, pass) {
  var d = deferred();

  var data = "username=" + user + "&password=" + pass + "&u=&action=Login";
  request({
    jar: cookieJar,
    url: "http://www.myepisodes.com/login.php",
    method: "POST",
    body: data,
    headers: {
      "Content-type": "application/x-www-form-urlencoded"
    }
  }, function (error, response, body) {
    if (response.statusCode == 302) {
      d.resolve();
    } else {
      d.reject();
    }
  });

  return d.promise();
};

var getShows = function() {
  var shows = [];
  var d = deferred();

  jsdom.env({
    url: "http://www.myepisodes.com/shows.php?type=manage",
    scripts: ["http://code.jquery.com/jquery.js"],
    jar: cookieJar,
    done: function (errors, window) {
      var $ = window.$;
      $("#shows").find("option").each(function (idx, elem) {
        var option = $(this);
        if (shows.length == 0) {
          shows.push({
            id: option.attr("value"),
            name: option.text()
          });
        }
      });
      d.resolve(shows);
    }
  });

  return d.promise();
};

var processShow = function(show) {
  console.log("- Processing " + show.name);
  var d = deferred();

  jsdom.env({
    url: "http://www.myepisodes.com/views.php?type=epsbyshow&showid=" + show.id,
    scripts: ["http://code.jquery.com/jquery.js"],
    jar: cookieJar,
    done: function (errors, window) {
      var $ = window.$;
      $("tr[class^='Episode_']").each(function(idx, elem) {
        var episode = {};
        $(elem).find("td").each(function (idx, elem) {
          var td = $(elem);
          if (td.hasClass("showname")) {
            episode.showname = td.text();
          } else if (td.hasClass("longnumber")) {
            episode.longnumber = td.text();
          } else if (td.hasClass("status")) {
            var input = $(td.children(":first"));
            if (input.attr("onclick").indexOf("Acquired") != -1) {
              episode.acquired = input.is(':checked');
            } else if (input.attr("onclick").indexOf("Viewed") != -1) {
              episode.viewed = !!input.is(':checked');
            }
          }
        });
        console.log(episode);
      });
      d.resolve();
    }
  });

  return d.promise();
};



login("USER", "PASS").then(function () {
  console.log("Login successful.");

  getShows().map(deferred.gate(function(show) {
    return processShow(show);
  }, 1)).then(function(){
    console.log("All done!");
  });

});