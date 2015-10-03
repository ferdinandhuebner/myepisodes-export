"use strict";

var request = require("request");
var deferred = require("deferred");
var jsdom = require("jsdom");
var fs = require("fs");
var _ = require("underscore");
var prompt = require('prompt');

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
        shows.push({
          id: option.attr("value"),
          name: option.text()
        });
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
      var episodes = [];
      var $ = window.$;

      var tvrageId = "";
      try {
        tvrageId = $("a[href^='http://www.tvrage.com/shows/id-']").attr("href").split("-")[1];
      } catch (err) {
        //
      }

      $("tr[class^='Episode_']").each(function(idx, elem) {
        var episode = {};
        episode.tvrageId = tvrageId;
        $(elem).find("td").each(function (idx, elem) {
          var td = $(elem);
          if (td.hasClass("showname")) {
            episode.showname = td.text();
          } else if (td.hasClass("longnumber")) {
            var x = td.text().split("x");
            try {
              episode.season = parseInt(x[0]);
            } catch (err) {

            }
            try {
              episode.episode = parseInt(x[1]);
            } catch (err) {

            }
            episode.longnumber = td.text();
          } else if (td.hasClass("status")) {
            var input = $(td.children(":first"));
            if (input.attr("onclick").indexOf("Acquired") != -1) {
              episode.acquired = input.is(":checked");
            } else if (input.attr("onclick").indexOf("Viewed") != -1) {
              episode.viewed = input.is(":checked");
            }
          }
        });
        episodes.push(episode);
      });
      d.resolve(episodes);
    }
  });

  return d.promise();
};

var writeEpisodes = function(episodes) {
  var now = function() {
    function pad(number) {
      if (number < 10) {
        return '0' + number;
      }
      return number;
    }
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-"
      + pad(d.getDate()) + "_" + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
  };
  var d = now();

  var csvData = "show name;tvrage id;season;episode;long episode;acquired;viewed\n" + episodes.map(function (episode) {
    return episode.showname + ";" + episode.tvrageId + ";" + episode.season + ";" + episode.episode + ";"
      + episode.longnumber + ";" + episode.acquired + ";" + episode.viewed + "\n"
  }).reduce(function (acc, episode) {
    return acc + episode;
  });

  fs.writeFileSync("myepisodes-export-" + d + ".csv", csvData);
  fs.writeFileSync("myepisodes-export-" + d + ".json", JSON.stringify(episodes));
};

prompt.message = "";
prompt.delimiter = "";

console.log("Please enter username and password for http://www.myepisodes.com");

prompt.start();


prompt.get(["username", "password"], function (err, result) {
  if (err) {
    console.log("Error reading username and password");
  } else {
    login(result.username, result.password).then(function () {
      console.log("Login successful.");

      getShows().map(deferred.gate(function(show) {
        return processShow(show);
      }, 1)).then(function(episodes){
        writeEpisodes(_.flatten(episodes));
        console.log("\nAll done. " + _.flatten(episodes).length + " episodes exported");
      });

    });
  }
});