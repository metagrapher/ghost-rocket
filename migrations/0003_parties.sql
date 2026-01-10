CREATE TABLE IF NOT EXISTS parties (
    id TEXT PRIMARY KEY,
    title TEXT,
    url TEXT,
    series TEXT,
    discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed initial parties from our current list
INSERT OR IGNORE INTO parties (id, title, url, series) VALUES 
('cubik041604', 'Cübik - 04-16-04', 'http://ssbproductions.com/cubik041604/', 'Cübik (2004)'),
('transit031710', 'Mass Transit - 03-17-10', 'http://ssbproductions.com/transit031710/', 'Mass Transit (2010)'),
('zebabar090118', 'Pump Pump - 09-01-18', 'http://ssbproductions.com/zebabar090118/', 'Zeba Bar (2018)'),
('transit033118', 'Mass Transit w/ JOHN B', 'http://ssbproductions.com/transit033118/', 'Mass Transit (2018)'),
('wickerman062318', 'WickerMan Burn - Sat', 'http://ssbproductions.com/wickerman062318/', 'WickerMan Burn (2018)'),
('wickerman062218', 'WickerMan Burn - Fri', 'http://ssbproductions.com/wickerman062218/', 'WickerMan Burn (2018)'),
('wickerman062118', 'WickerMan Burn - Thu', 'http://ssbproductions.com/wickerman062118/', 'WickerMan Burn (2018)'),
('farmshow03', 'Farm Show 2003', 'http://ssbproductions.com/farmshow03/', 'Farm Show (2003)'),
('starscape060609', 'Starscape 2009', 'http://ssbproductions.com/starscape060609/', 'Starscape (2009)'),
('starscape060708', 'Starscape 2008', 'http://ssbproductions.com/starscape060708/', 'Starscape (2008)'),
('paradox082909', 'Summer Massive - 08-29-09', 'http://ssbproductions.com/paradox082909/', 'Spring Massive (2009)'),
('paradox042509', 'Spring Massive - 04-25-09', 'http://ssbproductions.com/paradox042509/', 'Spring Massive (2009)'),
('potd091808', 'Planet of the Drums', 'http://ssbproductions.com/potd091808/', 'Planet of the Drums (2008)'),
('gothprom052409', 'Goth Prom at Town', 'http://ssbproductions.com/gothprom052409/', 'Goth Prom (2009)'),
('ibiza120509', 'Ibiza - 12-05-09', 'http://ssbproductions.com/ibiza120509/', 'Ibiza (2009)'),
('fallmassive112809', 'Fall Massive 2009', 'http://ssbproductions.com/fallmassive112809/', 'Fall Massive (2009)'),
('buzzboat2009-7', 'Buzz Boat Closing', 'http://ssbproductions.com/buzzboat2009-7/', 'Buzz Boat (2009)'),
('buzzboat2009-3', 'Buzz Boat Bahama', 'http://ssbproductions.com/buzzboat2009-3/', 'Buzz Boat (2009)'),
('buzz062708', 'Buzz w/ Lee Burridge', 'http://ssbproductions.com/buzz062708/', 'Buzz (2008)'),
('starscape2004', 'Starscape 2004', 'http://ssbproductions.com/starscape2004/', 'Starscape (2004)');
