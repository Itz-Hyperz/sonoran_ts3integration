/*
  SonoranCAD FiveM - A SonoranCAD integration for FiveM servers
   Copyright (C) 2020  Sonoran Software

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program in the file "LICENSE".  If not, see <http://www.gnu.org/licenses/>.
*/

const { TeamSpeak, QueryProtocol } = require("ts3-nodejs-library");
var ts3config = require("./plugins/ts3integration/config_ts3integration.json");
var clientsToAdd = [];
var clientsToRemove = [];

on('SonoranCAD::pushevents:UnitLogin', function(unit) {
    for(let apiId of unit.data.apiIds) {
        if (apiId.includes("=")) {
            clientsToAdd.push(apiId);
        }
    }
});

on('SonoranCAD::pushevents:UnitLogout', function(id) {
    let uid = exports.sonorancad.GetUnitById(id)-1;
    let unit = exports.sonorancad.GetUnitCache()[uid];
    if (isNaN(uid)) {
        return;
    }
    if (unit != undefined) {
        for(let apiId of unit.data.apiIds) {
            if (apiId.includes("=")) {
                clientsToRemove.push(apiId);
            }
        }
    } else {
        emit("SonoranCAD::core:writeLog", "debug", `TS3 Integration Error: Could not find matching unit: ${id} not found, index should be ${uid}`);
    }
});

setInterval(() => {
    if (clientsToAdd.length > 0 || clientsToRemove.length > 0) {
        TeamSpeak.connect({
            host: ts3config.ts3server_host,
            queryport: Number(ts3config.ts3server_qport),
            serverport: Number(ts3config.ts3server_port),
            protocol: QueryProtocol.RAW,
            username: ts3config.ts3server_user,
            password: ts3config.ts3server_pass,
            nickname: "SonoranCAD Integration"
        }).then(async teamspeak => {
            //retrieve the server group
            const sGroup = await teamspeak.getServerGroupByName(ts3config.onduty_servergroup);
            if (!sGroup) {
                emit("SonoranCAD::core:writeLog", "error", "TS3 Integration Error: Unable to locate server group. Ensure onduty_servergroup is set.");
                clientsToAdd = [];
                clientsToRemove = [];
                return;
            }
        
            for(let id of clientsToAdd) {
                let client = await teamspeak.getClientByUid(id);
                if (!client) {
                    emit("SonoranCAD::core:writeLog", "warn", "Was unable to locate client with ID " + id);
                } else {
                    await teamspeak.clientAddServerGroup(client, sGroup);
                    emit("SonoranCAD::core:writeLog", "debug", "Adding " + client.nickname + " to onduty group " + ts3config.onduty_servergroup); 
                }
            }
            for(let id of clientsToRemove) {
                let client = await teamspeak.getClientByUid(id);
                if (!client) {
                    emit("SonoranCAD::core:writeLog", "warn", "Was unable to locate client with ID " + id);
                } else {
                    // get name of channel client is in
                    let channel = await teamspeak.getChannelById(client.cid);
                    if (ts3config.enforced_channels.includes(channel.name)) {
                        await teamspeak.clientKick(client, 4, "Went off duty", true);
                    } else {
                        print("client not in enforced channel");
                    }
                    await teamspeak.clientDelServerGroup(client, sGroup);
                    emit("SonoranCAD::core:writeLog", "debug", "Removing " + client.nickname + " from onduty group " + ts3config.onduty_servergroup); 
                }
            }
            clientsToAdd = [];
            clientsToRemove = [];
            await teamspeak.quit();
        }).catch(e => {
            emit("SonoranCAD::core:writeLog", "error", "TS3 Integration Error: " + e);
            clientsToAdd = [];
            clientsToRemove = [];
        })
    }
}, 5000)

